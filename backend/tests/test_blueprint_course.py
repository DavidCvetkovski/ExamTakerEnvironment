"""Epoch 8.9.1 — blueprint ↔ course association (F1) and course filter (F2).

Covers: create with a valid course, create unassigned, reject invalid/inactive
course, list filtering by course / unassigned / all, and duplicate copying the
course assignment.
"""
import uuid

import prisma as prisma_lib
import pytest
from httpx import AsyncClient

from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole


ADMIN_EMAIL, ADMIN_PASS = "admin_bpcourse@vu.nl", "pass"


async def login(ac: AsyncClient, email: str, password: str) -> str:
    response = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
async def setup_bpcourse(cleanup_database):
    admin = await prisma.users.create(
        data={
            "email": ADMIN_EMAIL,
            "hashed_password": hash_password(ADMIN_PASS),
            "role": UserRole.ADMIN,
        }
    )
    bank = await prisma.item_banks.create(data={"name": "BP Course Bank", "created_by": admin.id})
    lo = await prisma.learning_objects.create(data={"bank_id": bank.id, "created_by": admin.id})

    course_a = await prisma.courses.create(
        data={"code": "BPC101", "title": "Course A", "created_by": admin.id}
    )
    course_b = await prisma.courses.create(
        data={"code": "BPC202", "title": "Course B", "created_by": admin.id}
    )
    inactive = await prisma.courses.create(
        data={"code": "BPC999", "title": "Inactive", "created_by": admin.id, "is_active": False}
    )
    return {
        "admin_id": admin.id,
        "lo_id": lo.id,
        "course_a": course_a.id,
        "course_b": course_b.id,
        "inactive": inactive.id,
    }


def _blueprint_payload(lo_id: str, course_id=None, title="BP"):
    return {
        "title": title,
        "course_id": course_id,
        "blocks": [
            {"title": "S1", "rules": [{"rule_type": "FIXED", "learning_object_id": lo_id}]}
        ],
        "duration_minutes": 30,
    }


@pytest.mark.anyio
async def test_create_blueprint_with_course(ac: AsyncClient, setup_bpcourse):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    resp = await ac.post(
        "/api/tests/",
        json=_blueprint_payload(setup_bpcourse["lo_id"], course_id=setup_bpcourse["course_a"]),
        headers=auth(token),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["course_id"] == setup_bpcourse["course_a"]


@pytest.mark.anyio
async def test_create_blueprint_unassigned(ac: AsyncClient, setup_bpcourse):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    resp = await ac.post(
        "/api/tests/",
        json=_blueprint_payload(setup_bpcourse["lo_id"], course_id=None),
        headers=auth(token),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["course_id"] is None


@pytest.mark.anyio
async def test_create_blueprint_nonexistent_course_rejected(ac: AsyncClient, setup_bpcourse):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    resp = await ac.post(
        "/api/tests/",
        json=_blueprint_payload(setup_bpcourse["lo_id"], course_id=str(uuid.uuid4())),
        headers=auth(token),
    )
    assert resp.status_code == 400, resp.text


@pytest.mark.anyio
async def test_create_blueprint_inactive_course_rejected(ac: AsyncClient, setup_bpcourse):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    resp = await ac.post(
        "/api/tests/",
        json=_blueprint_payload(setup_bpcourse["lo_id"], course_id=setup_bpcourse["inactive"]),
        headers=auth(token),
    )
    assert resp.status_code == 400, resp.text


@pytest.mark.anyio
async def test_list_filter_by_course_unassigned_and_all(ac: AsyncClient, setup_bpcourse):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    lo = setup_bpcourse["lo_id"]
    # One blueprint per course A, B, and one unassigned.
    await ac.post("/api/tests/", json=_blueprint_payload(lo, setup_bpcourse["course_a"], "A"), headers=auth(token))
    await ac.post("/api/tests/", json=_blueprint_payload(lo, setup_bpcourse["course_b"], "B"), headers=auth(token))
    await ac.post("/api/tests/", json=_blueprint_payload(lo, None, "U"), headers=auth(token))

    all_resp = await ac.get("/api/tests/", headers=auth(token))
    assert all_resp.status_code == 200
    assert len(all_resp.json()) == 3

    a_resp = await ac.get(f"/api/tests/?course_id={setup_bpcourse['course_a']}", headers=auth(token))
    assert [b["title"] for b in a_resp.json()] == ["A"]

    un_resp = await ac.get("/api/tests/?course_id=unassigned", headers=auth(token))
    assert [b["title"] for b in un_resp.json()] == ["U"]


@pytest.mark.anyio
async def test_update_blueprint_course(ac: AsyncClient, setup_bpcourse):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    create = await ac.post(
        "/api/tests/",
        json=_blueprint_payload(setup_bpcourse["lo_id"], course_id=None),
        headers=auth(token),
    )
    bp_id = create.json()["id"]
    upd = await ac.put(
        f"/api/tests/{bp_id}",
        json=_blueprint_payload(setup_bpcourse["lo_id"], course_id=setup_bpcourse["course_b"]),
        headers=auth(token),
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["course_id"] == setup_bpcourse["course_b"]


@pytest.mark.anyio
async def test_duplicate_copies_course(ac: AsyncClient, setup_bpcourse):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    create = await ac.post(
        "/api/tests/",
        json=_blueprint_payload(setup_bpcourse["lo_id"], course_id=setup_bpcourse["course_a"]),
        headers=auth(token),
    )
    bp_id = create.json()["id"]
    dup = await ac.post(f"/api/tests/{bp_id}/duplicate", headers=auth(token))
    assert dup.status_code == 201, dup.text
    new_id = dup.json()["id"]
    fetched = await ac.get(f"/api/tests/{new_id}", headers=auth(token))
    assert fetched.json()["course_id"] == setup_bpcourse["course_a"]

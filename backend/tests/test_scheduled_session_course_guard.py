"""Epoch 8.9.1 — F3 authoritative guard: a blueprint may only be scheduled into
a course it is assigned to, or into any course when it is unassigned.

The frontend disables the blueprint picker until a course is chosen, but that is
advisory; this guard in scheduled_sessions_service is the real rule (CLAUDE.md §1).
"""
from datetime import datetime, timedelta, timezone

import prisma as prisma_lib
import pytest
from httpx import AsyncClient

from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole


ADMIN_EMAIL, ADMIN_PASS = "admin_guard@vu.nl", "pass"


async def login(ac: AsyncClient, email: str, password: str) -> str:
    response = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _make_blueprint(admin_id: str, lo_id: str, course_id=None, title="BP"):
    return await prisma.test_definitions.create(
        data={
            "title": title,
            "created_by": admin_id,
            "course_id": course_id,
            "blocks": prisma_lib.Json(
                [{"title": "S1", "rules": [{"rule_type": "FIXED", "learning_object_id": lo_id}]}]
            ),
            "duration_minutes": 30,
        }
    )


@pytest.fixture(scope="function")
async def setup_guard(cleanup_database):
    admin = await prisma.users.create(
        data={"email": ADMIN_EMAIL, "hashed_password": hash_password(ADMIN_PASS), "role": UserRole.ADMIN}
    )
    bank = await prisma.item_banks.create(data={"name": "Guard Bank", "created_by": admin.id})
    lo = await prisma.learning_objects.create(data={"bank_id": bank.id, "created_by": admin.id})

    course_a = await prisma.courses.create(data={"code": "GA101", "title": "A", "created_by": admin.id})
    course_b = await prisma.courses.create(data={"code": "GB202", "title": "B", "created_by": admin.id})

    bp_a = await _make_blueprint(admin.id, lo.id, course_a.id, "Assigned to A")
    bp_unassigned = await _make_blueprint(admin.id, lo.id, None, "Unassigned")

    return {
        "course_a": course_a.id,
        "course_b": course_b.id,
        "bp_a": bp_a.id,
        "bp_unassigned": bp_unassigned.id,
    }


def _schedule_body(course_id, test_id):
    return {
        "course_id": course_id,
        "test_definition_id": test_id,
        "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
    }


@pytest.mark.anyio
async def test_schedule_matching_course_allowed(ac: AsyncClient, setup_guard):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    resp = await ac.post(
        "/api/scheduled-sessions/",
        json=_schedule_body(setup_guard["course_a"], setup_guard["bp_a"]),
        headers=auth(token),
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.anyio
async def test_schedule_unassigned_blueprint_allowed_anywhere(ac: AsyncClient, setup_guard):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    resp = await ac.post(
        "/api/scheduled-sessions/",
        json=_schedule_body(setup_guard["course_b"], setup_guard["bp_unassigned"]),
        headers=auth(token),
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.anyio
async def test_schedule_mismatched_course_rejected(ac: AsyncClient, setup_guard):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    # bp_a is assigned to course A; scheduling into course B must 400.
    resp = await ac.post(
        "/api/scheduled-sessions/",
        json=_schedule_body(setup_guard["course_b"], setup_guard["bp_a"]),
        headers=auth(token),
    )
    assert resp.status_code == 400, resp.text
    assert "not available for the selected course" in resp.json()["detail"]

"""Epoch 10 — accommodation administration: admin-only provision management,
atomic audit logging, and CSV import."""

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole


@pytest.fixture
async def ac():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True)
async def use_cleanup(cleanup_database):
    pass


async def _make_user(email, role, password="pass1234", vunet_id=None):
    return await prisma.users.create(
        data={
            "email": email,
            "hashed_password": hash_password(password),
            "role": role.value if isinstance(role, UserRole) else role,
            "is_active": True,
            "vunet_id": vunet_id,
        }
    )


async def _login(ac, email, password="pass1234"):
    resp = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.anyio
async def test_admin_sets_multiplier_and_writes_audit(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    student = await _make_user("stud@vu.nl", UserRole.STUDENT, vunet_id="stud01")
    token = await _login(ac, "admin@vu.nl")

    resp = await ac.patch(
        f"/api/accommodations/students/{student.id}",
        json={"provision_time_multiplier": 1.5, "enlarged_display": True},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert resp.json()["provision_time_multiplier"] == 1.5
    assert resp.json()["accommodation_enlarged_display"] is True

    # Two audit rows (one per changed field), attributed to the admin.
    audit = await ac.get(f"/api/accommodations/students/{student.id}/audit", headers=_auth(token))
    assert audit.status_code == 200
    body = audit.json()
    assert body["total"] == 2
    fields = {row["field"] for row in body["items"]}
    assert fields == {"provision_time_multiplier", "accommodation_enlarged_display"}
    assert all(row["source"] == "manual" for row in body["items"])


@pytest.mark.anyio
async def test_non_admin_forbidden(ac: AsyncClient):
    await _make_user("con@vu.nl", UserRole.CONSTRUCTOR)
    student = await _make_user("stud@vu.nl", UserRole.STUDENT)
    token = await _login(ac, "con@vu.nl")

    assert (await ac.get("/api/accommodations/students", headers=_auth(token))).status_code == 403
    patch = await ac.patch(
        f"/api/accommodations/students/{student.id}",
        json={"provision_time_multiplier": 1.5},
        headers=_auth(token),
    )
    assert patch.status_code == 403


@pytest.mark.anyio
async def test_multiplier_bounds_rejected(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    student = await _make_user("stud@vu.nl", UserRole.STUDENT)
    token = await _login(ac, "admin@vu.nl")

    for bad in (0.5, 25):
        resp = await ac.patch(
            f"/api/accommodations/students/{student.id}",
            json={"provision_time_multiplier": bad},
            headers=_auth(token),
        )
        assert resp.status_code == 422


@pytest.mark.anyio
async def test_cannot_target_non_student(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    reviewer = await _make_user("rev@vu.nl", UserRole.REVIEWER)
    token = await _login(ac, "admin@vu.nl")

    resp = await ac.patch(
        f"/api/accommodations/students/{reviewer.id}",
        json={"provision_time_multiplier": 1.5},
        headers=_auth(token),
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_csv_import_applies_valid_reports_bad(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    await _make_user("a@vu.nl", UserRole.STUDENT, vunet_id="aaa")
    await _make_user("b@vu.nl", UserRole.STUDENT, vunet_id="bbb")
    token = await _login(ac, "admin@vu.nl")

    csv_body = (
        "vunet_id,provision_time_multiplier,enlarged_display\n"
        "aaa,1.25,true\n"        # applied
        "bbb,9.0,false\n"        # error: out of bounds
        "ghost,1.5,false\n"      # error: no matching student
    )
    resp = await ac.post(
        "/api/accommodations/import",
        files={"file": ("provisions.csv", csv_body, "text/csv")},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["applied"] == 1
    assert body["errors"] == 2

    # The valid row took effect and was audited with the csv_import source.
    student = await prisma.users.find_unique(where={"vunet_id": "aaa"})
    assert student.provision_time_multiplier == 1.25
    assert student.accommodation_enlarged_display is True
    # Both fields changed (1.0→1.25 and false→true) → two audit rows.
    audit = await prisma.accommodation_audit_log.find_many(where={"student_id": str(student.id)})
    assert len(audit) == 2
    assert all(row.source == "csv_import" for row in audit)


@pytest.mark.anyio
async def test_list_requires_admin_and_paginates(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    for i in range(3):
        await _make_user(f"s{i}@vu.nl", UserRole.STUDENT, vunet_id=f"v{i}")
    token = await _login(ac, "admin@vu.nl")

    resp = await ac.get("/api/accommodations/students?skip=0&limit=2", headers=_auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
    assert body["limit"] == 2

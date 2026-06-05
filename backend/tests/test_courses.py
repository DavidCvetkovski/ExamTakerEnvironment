import pytest
from httpx import AsyncClient

from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole


ADMIN_EMAIL, ADMIN_PASS = "admin_courses@vu.nl", "pass"
CONSTRUCTOR_EMAIL, CONSTRUCTOR_PASS = "constructor_courses@vu.nl", "pass"
STUDENT_EMAIL, STUDENT_PASS = "student_courses@vu.nl", "pass"


@pytest.fixture(scope="function")
async def setup_courses_data(cleanup_database):
    admin = await prisma.users.create(
        data={
            "email": ADMIN_EMAIL,
            "hashed_password": hash_password(ADMIN_PASS),
            "role": UserRole.ADMIN,
        }
    )
    await prisma.users.create(
        data={
            "email": CONSTRUCTOR_EMAIL,
            "hashed_password": hash_password(CONSTRUCTOR_PASS),
            "role": UserRole.CONSTRUCTOR,
        }
    )
    student = await prisma.users.create(
        data={
            "email": STUDENT_EMAIL,
            "hashed_password": hash_password(STUDENT_PASS),
            "role": UserRole.STUDENT,
        }
    )
    return {"admin_id": admin.id, "student_id": student.id}


async def login(ac: AsyncClient, email: str, password: str) -> str:
    response = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.anyio
async def test_create_course_and_enroll_student(ac: AsyncClient, setup_courses_data):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)

    create_resp = await ac.post(
        "/api/courses/",
        json={"code": "BIO101", "title": "Biology 101"},
        headers=auth(token),
    )
    assert create_resp.status_code == 201
    course_id = create_resp.json()["id"]

    enroll_resp = await ac.post(
        f"/api/courses/{course_id}/enrollments",
        json={"student_id": setup_courses_data["student_id"]},
        headers=auth(token),
    )
    assert enroll_resp.status_code == 201
    assert enroll_resp.json()["student_email"] == STUDENT_EMAIL

    list_resp = await ac.get(
        f"/api/courses/{course_id}/enrollments",
        headers=auth(token),
    )
    assert list_resp.status_code == 200
    body = list_resp.json()
    assert body["roster_locked"] is False
    assert len(body["enrollments"]) == 1


@pytest.mark.anyio
async def test_roster_changes_are_audited(ac: AsyncClient, setup_courses_data):
    """Courses are co-managed, so every enroll/remove writes an attributable
    audit row (who, which student, which action)."""
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    course_id = (await ac.post(
        "/api/courses/", json={"code": "AUD101", "title": "Audited"}, headers=auth(token),
    )).json()["id"]
    student_id = setup_courses_data["student_id"]

    await ac.post(
        f"/api/courses/{course_id}/enrollments",
        json={"student_id": student_id}, headers=auth(token),
    )
    await ac.delete(f"/api/courses/{course_id}/enrollments/{student_id}", headers=auth(token))

    rows = await prisma.course_enrollment_audit.find_many(where={"course_id": course_id})
    actions = sorted(r.action for r in rows)
    assert actions == ["ENROLL", "REMOVE"]
    # Every row is attributed to the admin who made the change.
    assert all(r.changed_by == setup_courses_data["admin_id"] for r in rows)
    assert all(r.student_id == student_id for r in rows)


@pytest.mark.anyio
async def test_remove_enrollment_hard_deletes(ac: AsyncClient, setup_courses_data):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    student_id = setup_courses_data["student_id"]

    create_resp = await ac.post(
        "/api/courses/",
        json={"code": "BIO201", "title": "Biology 201"},
        headers=auth(token),
    )
    course_id = create_resp.json()["id"]

    await ac.post(
        f"/api/courses/{course_id}/enrollments",
        json={"student_id": student_id},
        headers=auth(token),
    )

    remove_resp = await ac.delete(
        f"/api/courses/{course_id}/enrollments/{student_id}",
        headers=auth(token),
    )
    assert remove_resp.status_code == 200

    list_resp = await ac.get(
        f"/api/courses/{course_id}/enrollments",
        headers=auth(token),
    )
    assert list_resp.json()["enrollments"] == []


@pytest.mark.anyio
async def test_ongoing_session_allows_add_blocks_remove(ac: AsyncClient, setup_courses_data):
    """While an exam is in progress staff may still admit a late arrival, but
    they may not pull an enrolled student out of a live attempt."""
    from datetime import datetime, timedelta, timezone

    import prisma as prisma_lib

    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    student_id = setup_courses_data["student_id"]

    create_resp = await ac.post(
        "/api/courses/",
        json={"code": "BIO301", "title": "Biology 301"},
        headers=auth(token),
    )
    course_id = create_resp.json()["id"]

    # Enroll the student before any session exists (roster freely mutable).
    pre_enroll = await ac.post(
        f"/api/courses/{course_id}/enrollments",
        json={"student_id": student_id},
        headers=auth(token),
    )
    assert pre_enroll.status_code == 201

    # A session whose window is currently open marks the course ongoing.
    test_def = await prisma.test_definitions.create(
        data={
            "title": "Live Exam",
            "created_by": setup_courses_data["admin_id"],
            "blocks": prisma_lib.Json([]),
            "duration_minutes": 60,
        }
    )
    now = datetime.now(timezone.utc)
    await prisma.scheduled_exam_sessions.create(
        data={
            "course_id": course_id,
            "test_definition_id": test_def.id,
            "created_by": setup_courses_data["admin_id"],
            "starts_at": now - timedelta(minutes=5),
            "ends_at": now + timedelta(minutes=55),
            "status": "ACTIVE",
        }
    )

    body = (
        await ac.get(f"/api/courses/{course_id}/enrollments", headers=auth(token))
    ).json()
    assert body["can_enroll"] is True
    assert body["can_remove"] is False
    assert body["lock_reason"] == "ONGOING"

    # Removing an enrolled student mid-exam is rejected.
    remove_resp = await ac.delete(
        f"/api/courses/{course_id}/enrollments/{student_id}",
        headers=auth(token),
    )
    assert remove_resp.status_code == 409

    # Admitting a late arrival is still allowed.
    latecomer = await prisma.users.create(
        data={
            "email": "latecomer@example.com",
            "hashed_password": hash_password("pw"),
            "role": UserRole.STUDENT,
        }
    )
    add_resp = await ac.post(
        f"/api/courses/{course_id}/enrollments",
        json={"student_id": str(latecomer.id)},
        headers=auth(token),
    )
    assert add_resp.status_code == 201


@pytest.mark.anyio
async def test_completed_session_locks_roster(ac: AsyncClient, setup_courses_data):
    """Once an exam has completed the cohort is final — neither adding nor
    removing students is permitted afterwards."""
    from datetime import datetime, timedelta, timezone

    import prisma as prisma_lib

    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    student_id = setup_courses_data["student_id"]

    create_resp = await ac.post(
        "/api/courses/",
        json={"code": "BIO401", "title": "Biology 401"},
        headers=auth(token),
    )
    course_id = create_resp.json()["id"]

    # Enroll before the session completes so we can prove removal is later blocked.
    pre_enroll = await ac.post(
        f"/api/courses/{course_id}/enrollments",
        json={"student_id": student_id},
        headers=auth(token),
    )
    assert pre_enroll.status_code == 201

    test_def = await prisma.test_definitions.create(
        data={
            "title": "Past Exam",
            "created_by": setup_courses_data["admin_id"],
            "blocks": prisma_lib.Json([]),
            "duration_minutes": 60,
        }
    )
    now = datetime.now(timezone.utc)
    # Window entirely in the past → completed → roster frozen.
    await prisma.scheduled_exam_sessions.create(
        data={
            "course_id": course_id,
            "test_definition_id": test_def.id,
            "created_by": setup_courses_data["admin_id"],
            "starts_at": now - timedelta(hours=2),
            "ends_at": now - timedelta(hours=1),
            "status": "CLOSED",
        }
    )

    body = (
        await ac.get(f"/api/courses/{course_id}/enrollments", headers=auth(token))
    ).json()
    assert body["roster_locked"] is True
    assert body["can_enroll"] is False
    assert body["can_remove"] is False
    assert body["lock_reason"] == "COMPLETED"

    # Both operations are rejected after completion.
    latecomer = await prisma.users.create(
        data={
            "email": "toolate@example.com",
            "hashed_password": hash_password("pw"),
            "role": UserRole.STUDENT,
        }
    )
    enroll_resp = await ac.post(
        f"/api/courses/{course_id}/enrollments",
        json={"student_id": str(latecomer.id)},
        headers=auth(token),
    )
    assert enroll_resp.status_code == 409

    remove_resp = await ac.delete(
        f"/api/courses/{course_id}/enrollments/{student_id}",
        headers=auth(token),
    )
    assert remove_resp.status_code == 409


@pytest.mark.anyio
async def test_constructor_cannot_create_course(ac: AsyncClient, setup_courses_data):
    token = await login(ac, CONSTRUCTOR_EMAIL, CONSTRUCTOR_PASS)

    response = await ac.post(
        "/api/courses/",
        json={"code": "BIO102", "title": "Biology 102"},
        headers=auth(token),
    )

    assert response.status_code == 403


@pytest.mark.anyio
async def test_student_cannot_manage_courses(ac: AsyncClient, setup_courses_data):
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    response = await ac.get("/api/courses/", headers=auth(token))
    assert response.status_code == 403

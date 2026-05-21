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
async def test_roster_locked_when_session_started(ac: AsyncClient, setup_courses_data):
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

    # A blueprint + a session whose window has already started locks the roster.
    test_def = await prisma.test_definitions.create(
        data={
            "title": "Locked Exam",
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

    list_resp = await ac.get(
        f"/api/courses/{course_id}/enrollments",
        headers=auth(token),
    )
    assert list_resp.json()["roster_locked"] is True

    enroll_resp = await ac.post(
        f"/api/courses/{course_id}/enrollments",
        json={"student_id": student_id},
        headers=auth(token),
    )
    assert enroll_resp.status_code == 409


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

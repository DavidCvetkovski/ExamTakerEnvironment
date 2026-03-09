import pytest
from httpx import AsyncClient

from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole


ADMIN_EMAIL, ADMIN_PASS = "admin_courses@vu.nl", "pass"
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
    assert len(list_resp.json()) == 1


@pytest.mark.anyio
async def test_student_cannot_manage_courses(ac: AsyncClient, setup_courses_data):
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    response = await ac.get("/api/courses/", headers=auth(token))
    assert response.status_code == 403

"""Epoch 8.9.1 — F1 (import): the `Course:` header assigns both the imported
questions and the generated blueprint to that course. Unknown course code →
both Unassigned, import still succeeds.
"""
import pytest
from httpx import AsyncClient

from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole


ADMIN_EMAIL, ADMIN_PASS = "admin_impcourse@vu.nl", "pass"


async def login(ac: AsyncClient, email: str, password: str) -> str:
    response = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _import_text(course_code: str) -> str:
    return (
        "#BLUEPRINT\n"
        "Title: Imported Blueprint\n"
        f"Course: {course_code}\n"
        "Duration: 30\n"
        "\n"
        "#BLOCK Block 1\n"
        "\n"
        "#Q What is 2 + 2?\n"
        "TYPE: MCQ\n"
        "A) 3\n"
        "B) 4 *\n"
    )


@pytest.fixture(scope="function")
async def setup_import(cleanup_database):
    admin = await prisma.users.create(
        data={"email": ADMIN_EMAIL, "hashed_password": hash_password(ADMIN_PASS), "role": UserRole.ADMIN}
    )
    course = await prisma.courses.create(
        data={"code": "IMP101", "title": "Import Course", "created_by": admin.id}
    )
    return {"admin_id": admin.id, "course_id": course.id}


@pytest.mark.anyio
async def test_import_assigns_blueprint_and_questions_to_course(ac: AsyncClient, setup_import):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    resp = await ac.post(
        "/api/import/commit",
        json={"raw_text": _import_text("IMP101"), "create_blueprint": True},
        headers=auth(token),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    blueprint_id = body["blueprint_id"]
    assert blueprint_id is not None

    # Blueprint carries the resolved course.
    bp = await prisma.test_definitions.find_unique(where={"id": blueprint_id})
    assert bp.course_id == setup_import["course_id"]

    # And so do the imported questions.
    for lo_id in body["created_lo_ids"]:
        lo = await prisma.learning_objects.find_unique(where={"id": lo_id})
        assert lo.course_id == setup_import["course_id"]


@pytest.mark.anyio
async def test_import_unknown_course_leaves_unassigned_but_succeeds(ac: AsyncClient, setup_import):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    resp = await ac.post(
        "/api/import/commit",
        json={"raw_text": _import_text("DOES-NOT-EXIST"), "create_blueprint": True},
        headers=auth(token),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()

    bp = await prisma.test_definitions.find_unique(where={"id": body["blueprint_id"]})
    assert bp.course_id is None
    for lo_id in body["created_lo_ids"]:
        lo = await prisma.learning_objects.find_unique(where={"id": lo_id})
        assert lo.course_id is None

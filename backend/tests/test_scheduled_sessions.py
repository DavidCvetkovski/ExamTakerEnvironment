from datetime import datetime, timedelta, timezone

import prisma as prisma_lib
import pytest
from httpx import AsyncClient

from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.item_version import ItemStatus, QuestionType
from app.models.user import UserRole


ADMIN_EMAIL, ADMIN_PASS = "admin_schedule@vu.nl", "pass"
STUDENT_EMAIL, STUDENT_PASS = "student_schedule@vu.nl", "pass"
OTHER_STUDENT_EMAIL, OTHER_STUDENT_PASS = "other_schedule@vu.nl", "pass"


@pytest.fixture(scope="function")
async def setup_scheduled_data(cleanup_database):
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
            "provision_time_multiplier": 1.25,
        }
    )
    other_student = await prisma.users.create(
        data={
            "email": OTHER_STUDENT_EMAIL,
            "hashed_password": hash_password(OTHER_STUDENT_PASS),
            "role": UserRole.STUDENT,
        }
    )

    bank = await prisma.item_banks.create(
        data={"name": "Schedule Bank", "created_by": admin.id}
    )
    lo_ids = []
    for index in range(2):
        lo = await prisma.learning_objects.create(
            data={"bank_id": bank.id, "created_by": admin.id}
        )
        lo_ids.append(lo.id)
        await prisma.item_versions.create(
            data={
                "learning_object_id": lo.id,
                "version_number": 1,
                "status": ItemStatus.APPROVED,
                "question_type": QuestionType.MULTIPLE_CHOICE,
                "content": prisma_lib.Json({"text": f"Scheduled Question {index}"}),
                "options": prisma_lib.Json({"question_type": "MULTIPLE_CHOICE", "choices": []}),
                "metadata_tags": prisma_lib.Json({"math": True}),
                "created_by": admin.id,
            }
        )

    test_definition = await prisma.test_definitions.create(
        data={
            "title": "Scheduled Blueprint",
            "created_by": admin.id,
            "blocks": prisma_lib.Json(
                [
                    {
                        "title": "Section 1",
                        "rules": [
                            {"rule_type": "FIXED", "learning_object_id": lo_ids[0]},
                            {"rule_type": "FIXED", "learning_object_id": lo_ids[1]},
                        ],
                    }
                ]
            ),
            "duration_minutes": 40,
        }
    )

    course = await prisma.courses.create(
        data={
            "code": "SCH101",
            "title": "Scheduling Course",
            "created_by": admin.id,
        }
    )

    await prisma.course_enrollments.create(
        data={
            "course_id": course.id,
            "student_id": student.id,
            "is_active": True,
        }
    )

    active_session = await prisma.scheduled_exam_sessions.create(
        data={
            "course_id": course.id,
            "test_definition_id": test_definition.id,
            "created_by": admin.id,
            "starts_at": datetime.now(timezone.utc) - timedelta(minutes=5),
            "ends_at": datetime.now(timezone.utc) + timedelta(minutes=30),
            "status": "SCHEDULED",
        }
    )

    future_session = await prisma.scheduled_exam_sessions.create(
        data={
            "course_id": course.id,
            "test_definition_id": test_definition.id,
            "created_by": admin.id,
            "starts_at": datetime.now(timezone.utc) + timedelta(days=1),
            "ends_at": datetime.now(timezone.utc) + timedelta(days=1, minutes=40),
            "status": "SCHEDULED",
        }
    )

    return {
        "admin_id": admin.id,
        "student_id": student.id,
        "other_student_id": other_student.id,
        "course_id": course.id,
        "test_definition_id": test_definition.id,
        "active_session_id": active_session.id,
        "future_session_id": future_session.id,
    }


async def login(ac: AsyncClient, email: str, password: str) -> str:
    response = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.anyio
async def test_create_scheduled_session(ac: AsyncClient, setup_scheduled_data):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    response = await ac.post(
        "/api/scheduled-sessions/",
        json={
            "course_id": setup_scheduled_data["course_id"],
            "test_definition_id": setup_scheduled_data["test_definition_id"],
            "starts_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
        },
        headers=auth(token),
    )
    assert response.status_code == 201
    assert response.json()["course_code"] == "SCH101"


@pytest.mark.anyio
async def test_student_lists_only_enrolled_future_and_active_sessions(ac: AsyncClient, setup_scheduled_data):
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    response = await ac.get("/api/student/sessions/", headers=auth(token))
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert any(item["status"] == "ACTIVE" for item in data)
    assert any(item["status"] == "SCHEDULED" for item in data)


@pytest.mark.anyio
async def test_enrolled_student_can_join_active_scheduled_session(ac: AsyncClient, setup_scheduled_data):
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    response = await ac.post(
        f"/api/student/sessions/{setup_scheduled_data['active_session_id']}/join",
        headers=auth(token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["session_mode"] == "ASSIGNED"
    assert body["return_path"] == "/my-exams"
    assert body["scheduled_session_id"] == setup_scheduled_data["active_session_id"]


@pytest.mark.anyio
async def test_non_enrolled_student_cannot_join(ac: AsyncClient, setup_scheduled_data):
    token = await login(ac, OTHER_STUDENT_EMAIL, OTHER_STUDENT_PASS)
    response = await ac.post(
        f"/api/student/sessions/{setup_scheduled_data['active_session_id']}/join",
        headers=auth(token),
    )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_student_cannot_join_future_session(ac: AsyncClient, setup_scheduled_data):
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    response = await ac.post(
        f"/api/student/sessions/{setup_scheduled_data['future_session_id']}/join",
        headers=auth(token),
    )
    assert response.status_code == 409

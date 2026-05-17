import pytest
from httpx import AsyncClient
from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole
from datetime import datetime, timedelta, timezone
import prisma as prisma_lib

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ADMIN_EMAIL, ADMIN_PASS = "admin_acc@vu.nl", "pass"
STANDARD_STUDENT, STANDARD_PASS = "student_standard@vu.nl", "pass"
EXTRA_STUDENT, EXTRA_PASS = "student_extra@vu.nl", "pass"


@pytest.fixture(scope="function")
async def setup_accommodations_data(cleanup_database):
    admin = await prisma.users.create(
        data={
            "email": ADMIN_EMAIL,
            "hashed_password": hash_password(ADMIN_PASS),
            "role": UserRole.ADMIN,
            "is_active": True,
        }
    )
    student = await prisma.users.create(
        data={
            "email": STANDARD_STUDENT,
            "hashed_password": hash_password(STANDARD_PASS),
            "role": UserRole.STUDENT,
            "is_active": True,
            "provision_time_multiplier": 1.0,
        }
    )
    student_acc = await prisma.users.create(
        data={
            "email": EXTRA_STUDENT,
            "hashed_password": hash_password(EXTRA_PASS),
            "role": UserRole.STUDENT,
            "is_active": True,
            "provision_time_multiplier": 1.25,
        }
    )

    test = await prisma.test_definitions.create(
        data={
            "title": "Timed Exam",
            "created_by": admin.id,
            "blocks": prisma_lib.Json([{"title": "Section 1", "rules": []}]),
            "duration_minutes": 60,
        }
    )

    # Students join via scheduled sessions — create a course, enroll both, add an active session.
    course = await prisma.courses.create(
        data={"code": "ACC101", "title": "Accommodations Course", "created_by": admin.id}
    )
    for student_id in [student.id, student_acc.id]:
        await prisma.course_enrollments.create(
            data={"course_id": course.id, "student_id": student_id, "is_active": True}
        )

    # Active scheduled session: starts in the past, ends in the future.
    scheduled = await prisma.scheduled_exam_sessions.create(
        data={
            "course_id": course.id,
            "test_definition_id": test.id,
            "created_by": admin.id,
            "starts_at": datetime.now(timezone.utc) - timedelta(minutes=5),
            "ends_at": datetime.now(timezone.utc) + timedelta(hours=2),
            "status": "SCHEDULED",  # ensure_scheduled_session_current promotes → ACTIVE on join
        }
    )

    return {
        "test_id": test.id,
        "scheduled_session_id": scheduled.id,
    }


async def login(ac: AsyncClient, email: str, password: str) -> str:
    resp = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_time_multiplier_application(ac: AsyncClient, setup_accommodations_data):
    """
    provision_time_multiplier is applied by the join flow.
    Code was correct; the old test used POST /api/sessions/ which now rejects students
    (students must join scheduled sessions). Updated to use the join endpoint.
    """
    scheduled_id = setup_accommodations_data["scheduled_session_id"]

    # 1. Standard student — expects 60 min window
    token = await login(ac, STANDARD_STUDENT, STANDARD_PASS)
    resp = await ac.post(f"/api/student/sessions/{scheduled_id}/join", headers=auth(token))
    assert resp.status_code == 200
    data = resp.json()
    expires_at = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
    started_at = datetime.fromisoformat(data["started_at"].replace("Z", "+00:00"))
    diff = (expires_at - started_at).total_seconds() / 60
    assert abs(diff - 60) < 1

    # 2. Extra-time student — expects 75 min window (60 * 1.25)
    token_acc = await login(ac, EXTRA_STUDENT, EXTRA_PASS)
    resp_acc = await ac.post(f"/api/student/sessions/{scheduled_id}/join", headers=auth(token_acc))
    assert resp_acc.status_code == 200
    data_acc = resp_acc.json()
    expires_at_acc = datetime.fromisoformat(data_acc["expires_at"].replace("Z", "+00:00"))
    started_at_acc = datetime.fromisoformat(data_acc["started_at"].replace("Z", "+00:00"))
    diff_acc = (expires_at_acc - started_at_acc).total_seconds() / 60
    assert abs(diff_acc - 75) < 1


@pytest.mark.anyio
async def test_auto_expiration_on_retrieval(ac: AsyncClient, setup_accommodations_data):
    """
    A session whose expires_at has passed is auto-marked EXPIRED on retrieval.
    Uses the join flow (students cannot create ad-hoc sessions since the enforcement
    of scheduled-session-only join was introduced).
    """
    scheduled_id = setup_accommodations_data["scheduled_session_id"]
    token = await login(ac, STANDARD_STUDENT, STANDARD_PASS)
    headers = auth(token)

    resp = await ac.post(f"/api/student/sessions/{scheduled_id}/join", headers=headers)
    assert resp.status_code == 200
    session_id = resp.json()["id"]

    # Manually backdate expires_at to simulate elapsed time.
    await prisma.exam_sessions.update_many(
        where={"id": session_id},
        data={"expires_at": datetime.now(timezone.utc) - timedelta(minutes=10)},
    )

    get_resp = await ac.get(f"/api/sessions/{session_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["status"] == "EXPIRED"

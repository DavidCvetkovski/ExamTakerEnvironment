"""Epoch 12 AGS grade passback tests.

External platform calls (token acquisition + score POST) are monkeypatched so
the state machine and validation are exercised without real HTTP.
"""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient

from prisma import Json
from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole
from app.services.lti import platform_client


@pytest.fixture(autouse=True)
async def use_cleanup(cleanup_database):
    pass


class _FakeResponse:
    def __init__(self, status_code: int, text: str = ""):
        self.status_code = status_code
        self.text = text


@pytest.fixture
def mock_platform(monkeypatch):
    """Mock token acquisition and return a controllable score-post outcome."""
    state = {"response": _FakeResponse(200), "raise": None}

    async def fake_token(platform, scope=platform_client.AGS_SCORE_SCOPE):
        return "fake-access-token"

    async def fake_post(line_item_url, access_token, payload):
        if state["raise"] is not None:
            raise state["raise"]
        return state["response"]

    monkeypatch.setattr(platform_client, "get_access_token", fake_token)
    monkeypatch.setattr(platform_client, "post_score", fake_post)
    return state


async def _make_user(email, role, password="pass1234"):
    return await prisma.users.create(
        data={"email": email, "hashed_password": hash_password(password),
              "role": role.value, "is_active": True}
    )


async def _login(ac, email, password="pass1234"):
    resp = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _seed_publishable_result(published: bool = True):
    """Create a published result wired to a Canvas line item via a resource link."""
    platform = await prisma.lti_platforms.create(
        data={"name": "Canvas", "issuer": "https://canvas.example.edu", "client_id": "client-1",
              "auth_login_url": "https://canvas.example.edu/auth",
              "auth_token_url": "https://canvas.example.edu/token",
              "auth_jwks_url": "https://canvas.example.edu/jwks",
              "deployment_ids": Json(["dep-a"]), "is_active": True}
    )
    deployment = await prisma.lti_deployments.create(
        data={"platform_id": str(platform.id), "deployment_id": "dep-a", "is_active": True}
    )
    student = await prisma.users.create(
        data={"email": "stud@vu.nl", "hashed_password": "x", "role": "STUDENT", "is_active": True}
    )
    await prisma.lti_user_links.create(
        data={"platform_id": str(platform.id), "issuer": "https://canvas.example.edu",
              "subject": "canvas-sub-1", "user_id": str(student.id)}
    )
    course = await prisma.courses.create(data={"code": "CS1", "title": "Intro"})
    test_def = await prisma.test_definitions.create(
        data={"title": "Exam", "blocks": Json([]), "duration_minutes": 60, "course_id": str(course.id)}
    )
    scheduled = await prisma.scheduled_exam_sessions.create(
        data={"course_id": str(course.id), "test_definition_id": str(test_def.id),
              "starts_at": datetime.now(timezone.utc),
              "ends_at": datetime.now(timezone.utc) + timedelta(hours=2)}
    )
    session = await prisma.exam_sessions.create(
        data={"test_definition_id": str(test_def.id), "student_id": str(student.id),
              "items": Json([]), "status": "SUBMITTED",
              "started_at": datetime.now(timezone.utc), "expires_at": datetime.now(timezone.utc),
              "scheduled_session_id": str(scheduled.id)}
    )
    result = await prisma.session_results.create(
        data={"session_id": str(session.id), "test_definition_id": str(test_def.id),
              "student_id": str(student.id), "total_points": 8.0, "max_points": 10.0,
              "percentage": 80.0, "grading_status": "FULLY_GRADED",
              "questions_graded": 5, "questions_total": 5, "is_published": published,
              "created_at": datetime.now(timezone.utc)}
    )
    await prisma.lti_resource_links.create(
        data={"platform_id": str(platform.id), "deployment_id": str(deployment.id),
              "resource_link_id": "res-1", "scheduled_session_id": str(scheduled.id),
              "line_item_url": "https://canvas.example.edu/api/lti/courses/1/line_items/9"}
    )
    return result


# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_passback_success(ac: AsyncClient, mock_platform):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")
    result = await _seed_publishable_result()

    resp = await ac.post(
        "/api/lti/grade-passbacks",
        json={"session_result_id": str(result.id)},
        headers=_auth(token),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "SUCCEEDED"
    assert body["score_given"] == 8.0 and body["score_maximum"] == 10.0
    assert body["pushed_at"] is not None
    assert body["attempts"] == 1


@pytest.mark.anyio
async def test_passback_retryable_then_succeeds(ac: AsyncClient, mock_platform):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")
    result = await _seed_publishable_result()
    mock_platform["response"] = _FakeResponse(503, "upstream down")

    first = await ac.post(
        "/api/lti/grade-passbacks", json={"session_result_id": str(result.id)}, headers=_auth(token)
    )
    assert first.status_code == 201
    passback_id = first.json()["id"]
    assert first.json()["status"] == "FAILED_RETRYABLE"

    # Platform recovers; manual retry succeeds.
    mock_platform["response"] = _FakeResponse(200)
    retry = await ac.post(f"/api/lti/grade-passbacks/{passback_id}/retry", headers=_auth(token))
    assert retry.status_code == 200
    assert retry.json()["status"] == "SUCCEEDED"
    assert retry.json()["attempts"] == 2


@pytest.mark.anyio
async def test_passback_permanent_failure_not_retryable(ac: AsyncClient, mock_platform):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")
    result = await _seed_publishable_result()
    mock_platform["response"] = _FakeResponse(400, "bad line item")

    created = await ac.post(
        "/api/lti/grade-passbacks", json={"session_result_id": str(result.id)}, headers=_auth(token)
    )
    assert created.json()["status"] == "FAILED_PERMANENT"
    passback_id = created.json()["id"]

    retry = await ac.post(f"/api/lti/grade-passbacks/{passback_id}/retry", headers=_auth(token))
    assert retry.status_code == 409


@pytest.mark.anyio
async def test_passback_unpublished_result_rejected(ac: AsyncClient, mock_platform):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")
    result = await _seed_publishable_result(published=False)

    resp = await ac.post(
        "/api/lti/grade-passbacks", json={"session_result_id": str(result.id)}, headers=_auth(token)
    )
    assert resp.status_code == 400
    assert "published" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_passback_requires_admin(ac: AsyncClient, mock_platform):
    await _make_user("c@vu.nl", UserRole.CONSTRUCTOR)
    token = await _login(ac, "c@vu.nl")
    result = await _seed_publishable_result()

    resp = await ac.post(
        "/api/lti/grade-passbacks", json={"session_result_id": str(result.id)}, headers=_auth(token)
    )
    assert resp.status_code == 403

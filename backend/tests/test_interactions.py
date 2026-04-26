"""
Comprehensive tests for Epoch 5 — Interaction Events (Heartbeat),
Answer Reconstruction, Submission, and Security.

Tests cover:
  1. Heartbeat happy-path (bulk insert)
  2. Batch validation (empty, >100 events)
  3. Answer reconstruction from event stream
  4. Flag reconstruction from event stream
  5. Submit + immutability (no heartbeat after submit)
  6. Double-submit rejection
  7. Expired session rejection
  8. Security: ownership enforcement on heartbeat
  9. Security: ownership enforcement on answers
  10. Security: ownership enforcement on submit
  11. Security: unauthenticated requests
"""
import pytest
from httpx import AsyncClient
from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole
from app.models.item_version import ItemStatus, QuestionType
from app.models.exam_session import SessionStatus
from datetime import datetime, timedelta, timezone
import prisma as prisma_lib


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

STUDENT_EMAIL = "student_heartbeat@vu.nl"
STUDENT_PASS = "pass"
OTHER_STUDENT_EMAIL = "other_heartbeat@vu.nl"
OTHER_STUDENT_PASS = "pass"
ADMIN_EMAIL = "admin_heartbeat@vu.nl"
ADMIN_PASS = "pass"


@pytest.fixture(scope="function")
async def heartbeat_data(cleanup_database):
    """
    Seeds the DB for heartbeat tests: an admin, a student, another student,
    a bank, 3 LOs with approved versions, a test definition, and a live session.
    """
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
    other_student = await prisma.users.create(
        data={
            "email": OTHER_STUDENT_EMAIL,
            "hashed_password": hash_password(OTHER_STUDENT_PASS),
            "role": UserRole.STUDENT,
        }
    )

    bank = await prisma.item_banks.create(
        data={"name": "Heartbeat Bank", "created_by": admin.id}
    )

    lo_ids = []
    iv_ids = []
    for i in range(3):
        lo = await prisma.learning_objects.create(
            data={"bank_id": bank.id, "created_by": admin.id}
        )
        lo_ids.append(lo.id)

        iv = await prisma.item_versions.create(
            data={
                "learning_object_id": lo.id,
                "version_number": 1,
                "status": ItemStatus.APPROVED,
                "question_type": QuestionType.MULTIPLE_CHOICE,
                "content": prisma_lib.Json({"text": f"Q{i}"}),
                "options": prisma_lib.Json({"choices": [
                    {"text": "A"}, {"text": "B"}, {"text": "C"}
                ]}),
                "created_by": admin.id,
            }
        )
        iv_ids.append(iv.id)

    test_def = await prisma.test_definitions.create(
        data={
            "title": "Heartbeat Test",
            "created_by": admin.id,
            "blocks": prisma_lib.Json([{
                "title": "Section 1",
                "rules": [
                    {"rule_type": "FIXED", "learning_object_id": lo_ids[0]},
                    {"rule_type": "FIXED", "learning_object_id": lo_ids[1]},
                    {"rule_type": "FIXED", "learning_object_id": lo_ids[2]},
                ],
            }]),
            "duration_minutes": 60,
        }
    )

    # Create a live session for the student
    session = await prisma.exam_sessions.create(
        data={
            "test_definition_id": test_def.id,
            "student_id": student.id,
            "items": prisma_lib.Json([
                {
                    "learning_object_id": lo_ids[i],
                    "item_version_id": iv_ids[i],
                    "content": {"text": f"Q{i}"},
                    "options": {"choices": [{"text": "A"}, {"text": "B"}, {"text": "C"}]},
                    "question_type": "MULTIPLE_CHOICE",
                    "version_number": 1,
                }
                for i in range(3)
            ]),
            "status": SessionStatus.STARTED.value,
            "started_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=60),
        }
    )

    return {
        "session_id": session.id,
        "lo_ids": lo_ids,
        "iv_ids": iv_ids,
        "student_id": student.id,
        "other_student_id": other_student.id,
        "admin_id": admin.id,
        "test_id": test_def.id,
    }


async def login(ac: AsyncClient, email: str, password: str) -> str:
    resp = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# 1. Heartbeat — Happy Path
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_heartbeat_saves_events(ac: AsyncClient, heartbeat_data):
    """POST /sessions/{id}/heartbeat with valid events returns correct count."""
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    d = heartbeat_data

    events = [
        {
            "learning_object_id": d["lo_ids"][0],
            "item_version_id": d["iv_ids"][0],
            "event_type": "ANSWER_CHANGE",
            "payload": {"selected_option_index": 1},
        },
        {
            "learning_object_id": d["lo_ids"][1],
            "item_version_id": d["iv_ids"][1],
            "event_type": "ANSWER_CHANGE",
            "payload": {"selected_option_index": 0},
        },
        {
            "learning_object_id": d["lo_ids"][0],
            "item_version_id": d["iv_ids"][0],
            "event_type": "FLAG_TOGGLE",
            "payload": {"flagged": True},
        },
    ]

    resp = await ac.post(
        f"/api/sessions/{d['session_id']}/heartbeat",
        json={"events": events},
        headers=auth(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["saved"] == 3
    assert "server_timestamp" in body

    # Verify DB has the records
    db_events = await prisma.interaction_events.find_many(
        where={"session_id": d["session_id"]}
    )
    assert len(db_events) == 3


# ---------------------------------------------------------------------------
# 2. Batch Validation
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_heartbeat_rejects_empty_batch(ac: AsyncClient, heartbeat_data):
    """Heartbeat with zero events returns 422."""
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)

    resp = await ac.post(
        f"/api/sessions/{heartbeat_data['session_id']}/heartbeat",
        json={"events": []},
        headers=auth(token),
    )
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_heartbeat_rejects_oversized_batch(ac: AsyncClient, heartbeat_data):
    """Heartbeat with >100 events returns 422."""
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    d = heartbeat_data

    events = [
        {
            "learning_object_id": d["lo_ids"][0],
            "item_version_id": d["iv_ids"][0],
            "event_type": "ANSWER_CHANGE",
            "payload": {"x": i},
        }
        for i in range(101)
    ]

    resp = await ac.post(
        f"/api/sessions/{d['session_id']}/heartbeat",
        json={"events": events},
        headers=auth(token),
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 3. Answer Reconstruction
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_answer_reconstruction_returns_latest(ac: AsyncClient, heartbeat_data):
    """GET /sessions/{id}/answers returns the latest answer per LO."""
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    d = heartbeat_data

    # Send multiple answer changes for the same LO — last one wins
    events = [
        {
            "learning_object_id": d["lo_ids"][0],
            "item_version_id": d["iv_ids"][0],
            "event_type": "ANSWER_CHANGE",
            "payload": {"selected_option_index": 0},
        },
        {
            "learning_object_id": d["lo_ids"][0],
            "item_version_id": d["iv_ids"][0],
            "event_type": "ANSWER_CHANGE",
            "payload": {"selected_option_index": 2},
        },
        {
            "learning_object_id": d["lo_ids"][1],
            "item_version_id": d["iv_ids"][1],
            "event_type": "ANSWER_CHANGE",
            "payload": {"selected_option_index": 1},
        },
    ]

    await ac.post(
        f"/api/sessions/{d['session_id']}/heartbeat",
        json={"events": events},
        headers=auth(token),
    )

    resp = await ac.get(
        f"/api/sessions/{d['session_id']}/answers",
        headers=auth(token),
    )
    assert resp.status_code == 200
    body = resp.json()

    # LO[0] should have the LAST answer (index 2)
    assert body["answers"][d["lo_ids"][0]]["selected_option_index"] == 2
    # LO[1] should have index 1
    assert body["answers"][d["lo_ids"][1]]["selected_option_index"] == 1
    # LO[2] was never answered
    assert d["lo_ids"][2] not in body["answers"]


# ---------------------------------------------------------------------------
# 4. Flag Reconstruction
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_flag_reconstruction(ac: AsyncClient, heartbeat_data):
    """GET /sessions/{id}/answers returns the latest flag state per LO."""
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    d = heartbeat_data

    events = [
        {
            "learning_object_id": d["lo_ids"][0],
            "item_version_id": d["iv_ids"][0],
            "event_type": "FLAG_TOGGLE",
            "payload": {"flagged": True},
        },
        {
            "learning_object_id": d["lo_ids"][0],
            "item_version_id": d["iv_ids"][0],
            "event_type": "FLAG_TOGGLE",
            "payload": {"flagged": False},  # Unflagged after
        },
        {
            "learning_object_id": d["lo_ids"][1],
            "item_version_id": d["iv_ids"][1],
            "event_type": "FLAG_TOGGLE",
            "payload": {"flagged": True},
        },
    ]

    await ac.post(
        f"/api/sessions/{d['session_id']}/heartbeat",
        json={"events": events},
        headers=auth(token),
    )

    resp = await ac.get(
        f"/api/sessions/{d['session_id']}/answers",
        headers=auth(token),
    )
    body = resp.json()

    # LO[0] was flagged then unflagged → False
    assert body["flags"][d["lo_ids"][0]] is False
    # LO[1] was flagged → True
    assert body["flags"][d["lo_ids"][1]] is True


# ---------------------------------------------------------------------------
# 5. Submit + Immutability
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_submit_session(ac: AsyncClient, heartbeat_data):
    """POST /sessions/{id}/submit locks the session and sets SUBMITTED."""
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    d = heartbeat_data

    # Save an answer first
    await ac.post(
        f"/api/sessions/{d['session_id']}/heartbeat",
        json={"events": [{
            "learning_object_id": d["lo_ids"][0],
            "item_version_id": d["iv_ids"][0],
            "event_type": "ANSWER_CHANGE",
            "payload": {"selected_option_index": 1},
        }]},
        headers=auth(token),
    )

    # Submit
    resp = await ac.post(
        f"/api/sessions/{d['session_id']}/submit",
        headers=auth(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "SUBMITTED"
    assert body["submitted_at"] is not None

    # Heartbeat after submit → 409
    resp2 = await ac.post(
        f"/api/sessions/{d['session_id']}/heartbeat",
        json={"events": [{
            "learning_object_id": d["lo_ids"][1],
            "item_version_id": d["iv_ids"][1],
            "event_type": "ANSWER_CHANGE",
            "payload": {"selected_option_index": 0},
        }]},
        headers=auth(token),
    )
    assert resp2.status_code == 409


# ---------------------------------------------------------------------------
# 6. Double Submit
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_double_submit_rejected(ac: AsyncClient, heartbeat_data):
    """Submitting an already-submitted session returns 400."""
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    d = heartbeat_data

    # Submit first time
    resp1 = await ac.post(
        f"/api/sessions/{d['session_id']}/submit",
        headers=auth(token),
    )
    assert resp1.status_code == 200

    # Submit again
    resp2 = await ac.post(
        f"/api/sessions/{d['session_id']}/submit",
        headers=auth(token),
    )
    assert resp2.status_code == 400
    assert "already been submitted" in resp2.json()["detail"]


# ---------------------------------------------------------------------------
# 7. Expired Session
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_heartbeat_rejects_expired_session(ac: AsyncClient, heartbeat_data):
    """Heartbeat to an expired session returns 409."""
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    d = heartbeat_data

    # Manually expire the session
    await prisma.exam_sessions.update(
        where={"id": d["session_id"]},
        data={
            "expires_at": datetime.now(timezone.utc) - timedelta(minutes=1),
        },
    )

    resp = await ac.post(
        f"/api/sessions/{d['session_id']}/heartbeat",
        json={"events": [{
            "learning_object_id": d["lo_ids"][0],
            "item_version_id": d["iv_ids"][0],
            "event_type": "ANSWER_CHANGE",
            "payload": {"x": 1},
        }]},
        headers=auth(token),
    )
    assert resp.status_code == 409


@pytest.mark.anyio
async def test_submit_rejects_expired_session(ac: AsyncClient, heartbeat_data):
    """Submitting an expired session returns 400."""
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    d = heartbeat_data

    # Expire the session
    await prisma.exam_sessions.update(
        where={"id": d["session_id"]},
        data={
            "expires_at": datetime.now(timezone.utc) - timedelta(minutes=1),
        },
    )

    resp = await ac.post(
        f"/api/sessions/{d['session_id']}/submit",
        headers=auth(token),
    )
    assert resp.status_code == 400
    assert "expired" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 8. Security: Ownership — Heartbeat
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_heartbeat_rejects_non_owner(ac: AsyncClient, heartbeat_data):
    """A different student cannot send heartbeats to someone else's session."""
    other_token = await login(ac, OTHER_STUDENT_EMAIL, OTHER_STUDENT_PASS)
    d = heartbeat_data

    resp = await ac.post(
        f"/api/sessions/{d['session_id']}/heartbeat",
        json={"events": [{
            "learning_object_id": d["lo_ids"][0],
            "item_version_id": d["iv_ids"][0],
            "event_type": "ANSWER_CHANGE",
            "payload": {"x": 1},
        }]},
        headers=auth(other_token),
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 9. Security: Ownership — Answers
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_answers_rejects_non_owner(ac: AsyncClient, heartbeat_data):
    """A different student cannot view someone else's answers."""
    other_token = await login(ac, OTHER_STUDENT_EMAIL, OTHER_STUDENT_PASS)
    d = heartbeat_data

    resp = await ac.get(
        f"/api/sessions/{d['session_id']}/answers",
        headers=auth(other_token),
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 10. Security: Ownership — Submit
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_submit_rejects_non_owner(ac: AsyncClient, heartbeat_data):
    """A different student cannot submit someone else's session."""
    other_token = await login(ac, OTHER_STUDENT_EMAIL, OTHER_STUDENT_PASS)
    d = heartbeat_data

    resp = await ac.post(
        f"/api/sessions/{d['session_id']}/submit",
        headers=auth(other_token),
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 11. Security: Unauthenticated
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_heartbeat_requires_auth(ac: AsyncClient, heartbeat_data):
    """Heartbeat without a token returns 401."""
    d = heartbeat_data

    resp = await ac.post(
        f"/api/sessions/{d['session_id']}/heartbeat",
        json={"events": [{
            "learning_object_id": d["lo_ids"][0],
            "item_version_id": d["iv_ids"][0],
            "event_type": "ANSWER_CHANGE",
            "payload": {"x": 1},
        }]},
    )
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_answers_requires_auth(ac: AsyncClient, heartbeat_data):
    """Answers endpoint without a token returns 401."""
    resp = await ac.get(
        f"/api/sessions/{heartbeat_data['session_id']}/answers",
    )
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_submit_requires_auth(ac: AsyncClient, heartbeat_data):
    """Submit endpoint without a token returns 401."""
    resp = await ac.post(
        f"/api/sessions/{heartbeat_data['session_id']}/submit",
    )
    assert resp.status_code == 401

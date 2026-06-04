"""Verification tests for the Epoch 14 bug audit (directives/epoch_14_bug_audit.md).

Each test pins one audit finding. The convention:

* ``@pytest.mark.xfail(strict=True, reason=...)`` — the test asserts the
  *intended* (post-fix) behaviour. While the bug is unfixed the test fails, so
  pytest reports it as ``xfailed`` → **the finding is real**. If the code already
  does the right thing the test passes unexpectedly → pytest reports ``XPASS``
  as a hard failure under ``strict=True`` → **the finding is NOT real** and the
  audit entry should be removed.

* A plain passing test characterises behaviour that is already correct, used to
  disprove a finding.

Run: ``pytest tests/test_epoch14_audit.py -v``
"""

import pytest
from datetime import datetime, timedelta, timezone

from httpx import AsyncClient
import prisma as prisma_lib

from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


async def login(ac: AsyncClient, email: str, password: str) -> str:
    resp = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ===========================================================================
# C-1 · Accommodation students silently short-changed on time
# File: backend/app/services/exam_sessions_service.py:474-476
# ===========================================================================

@pytest.fixture(scope="function")
async def c1_data(cleanup_database):
    """A 1.5x student enrolled in a course whose only session has a window far
    narrower than the student's entitled time."""
    admin = await prisma.users.create(
        data={
            "email": "c1_admin@vu.nl",
            "hashed_password": hash_password("pass"),
            "role": UserRole.ADMIN,
            "is_active": True,
        }
    )
    student = await prisma.users.create(
        data={
            "email": "c1_student@vu.nl",
            "hashed_password": hash_password("pass"),
            "role": UserRole.STUDENT,
            "is_active": True,
            "provision_time_multiplier": 1.5,  # 60 min base → 90 min entitled
        }
    )
    test = await prisma.test_definitions.create(
        data={
            "title": "C1 Exam",
            "created_by": admin.id,
            "blocks": prisma_lib.Json([{"title": "S1", "rules": []}]),
            "duration_minutes": 60,
        }
    )
    course = await prisma.courses.create(
        data={"code": "C1X", "title": "C1 Course", "created_by": admin.id}
    )
    await prisma.course_enrollments.create(
        data={"course_id": course.id, "student_id": student.id, "is_active": True}
    )
    now = datetime.now(timezone.utc)
    # Window: started 5 min ago, closes in 30 min → only ~30 min remain, but the
    # student is entitled to 90. The accommodation cannot be honoured.
    scheduled = await prisma.scheduled_exam_sessions.create(
        data={
            "course_id": course.id,
            "test_definition_id": test.id,
            "created_by": admin.id,
            "starts_at": now - timedelta(minutes=5),
            "ends_at": now + timedelta(minutes=30),
            "status": "ACTIVE",
        }
    )
    return {"scheduled_id": scheduled.id, "student_email": "c1_student@vu.nl"}


@pytest.mark.anyio
async def test_c1_clipping_is_real(ac: AsyncClient, c1_data):
    """Characterisation: prove the clip actually happens (no xfail needed —
    this documents the observable symptom)."""
    token = await login(ac, c1_data["student_email"], "pass")
    resp = await ac.post(f"/api/student/sessions/{c1_data['scheduled_id']}/join", headers=auth(token))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    granted_min = (_parse(data["expires_at"]) - _parse(data["started_at"])).total_seconds() / 60
    # Entitled to 90; window only allows ~30. The student is silently clipped.
    assert granted_min < 90
    assert granted_min == pytest.approx(30, abs=2)


@pytest.mark.anyio
async def test_c1_clip_records_incident(ac: AsyncClient, c1_data):
    """When an accommodation is clipped by the window, an ACCOMMODATION_CLIPPED
    incident is recorded so the supervisor knows. (Fixed — C-1.)"""
    token = await login(ac, c1_data["student_email"], "pass")
    resp = await ac.post(f"/api/student/sessions/{c1_data['scheduled_id']}/join", headers=auth(token))
    assert resp.status_code == 200, resp.text

    incidents = await prisma.proctoring_incidents.find_many(
        where={"scheduled_session_id": c1_data["scheduled_id"]}
    )
    # A clip occurred (30 < 90); there should be exactly one record of it.
    assert len(incidents) >= 1, "no incident recorded for the clipped accommodation"
    clip = next(i for i in incidents if i.incident_type == "ACCOMMODATION_CLIPPED")
    assert clip.severity == "WARNING"
    assert clip.detail["entitled_minutes"] == 90
    assert clip.detail["granted_minutes"] < 90


# ===========================================================================
# C-3 · Refresh tokens accepted as access tokens on protected endpoints
# File: backend/app/core/dependencies.py:53 (no `type` claim check)
# ===========================================================================

@pytest.fixture(scope="function")
async def c3_user(cleanup_database):
    await prisma.users.create(
        data={
            "email": "c3@vu.nl",
            "hashed_password": hash_password("pass"),
            "role": UserRole.STUDENT,
            "is_active": True,
        }
    )
    return {"email": "c3@vu.nl", "password": "pass"}


@pytest.mark.anyio
async def test_c3_access_token_works(ac: AsyncClient, c3_user):
    """Control: a genuine access token is accepted on /auth/me (sanity)."""
    login_resp = await ac.post("/api/auth/login", json=c3_user)
    assert login_resp.status_code == 200
    access = login_resp.json()["access_token"]
    me = await ac.get("/api/auth/me", headers=auth(access))
    assert me.status_code == 200


@pytest.mark.anyio
async def test_c3_refresh_token_rejected_as_bearer(ac: AsyncClient, c3_user):
    """A refresh token (days-long expiry, set as an httpOnly cookie) must NOT be
    accepted as a Bearer access token on protected endpoints. (Fixed — C-3.)"""
    login_resp = await ac.post("/api/auth/login", json=c3_user)
    assert login_resp.status_code == 200
    refresh_token = login_resp.cookies.get("refresh_token")
    assert refresh_token, "login did not set a refresh_token cookie"

    # Present the refresh token where an access token is expected.
    me = await ac.get("/api/auth/me", headers=auth(refresh_token))
    assert me.status_code == 401, (
        f"refresh token was accepted as access token (status {me.status_code}) — "
        "type claim is not validated"
    )


# ===========================================================================
# H-10 · GET /grading/sessions/{id}/grades has no test-ownership check
# File: backend/app/api/endpoints/grading.py:51-55
# ===========================================================================

@pytest.fixture(scope="function")
async def h10_data(cleanup_database):
    """Two CONSTRUCTORs. Alice owns a test with a submitted session; Bob owns
    nothing related to it."""
    alice = await prisma.users.create(
        data={"email": "h10_alice@vu.nl", "hashed_password": hash_password("pass"),
              "role": UserRole.CONSTRUCTOR, "is_active": True}
    )
    bob = await prisma.users.create(
        data={"email": "h10_bob@vu.nl", "hashed_password": hash_password("pass"),
              "role": UserRole.CONSTRUCTOR, "is_active": True}
    )
    student = await prisma.users.create(
        data={"email": "h10_student@vu.nl", "hashed_password": hash_password("pass"),
              "role": UserRole.STUDENT, "is_active": True}
    )
    test = await prisma.test_definitions.create(
        data={"title": "Alice Test", "created_by": alice.id,
              "blocks": prisma_lib.Json([]), "duration_minutes": 60}
    )
    now = datetime.now(timezone.utc)
    session = await prisma.exam_sessions.create(
        data={
            "test_definition_id": test.id,
            "student_id": student.id,
            "items": prisma_lib.Json([]),
            "status": "SUBMITTED",
            "started_at": now - timedelta(hours=1),
            "submitted_at": now - timedelta(minutes=30),
            "expires_at": now,
            "session_mode": "ASSIGNED",
        }
    )
    # A grade row so a leak would expose real answer/feedback content.
    import uuid as _uuid
    await prisma.question_grades.create(
        data={
            "session_id": session.id,
            "learning_object_id": str(_uuid.uuid4()),
            "item_version_id": str(_uuid.uuid4()),
            "points_awarded": 5.0,
            "points_possible": 10.0,
            "is_auto_graded": True,
            "student_answer": prisma_lib.Json({"text": "secret answer"}),
            "feedback": "private feedback",
            "created_at": now,
        }
    )
    return {"session_id": session.id}


@pytest.mark.anyio
async def test_h10_owner_can_read_grades(ac: AsyncClient, h10_data):
    """Control: the owning constructor (Alice) can read the grades."""
    token = await login(ac, "h10_alice@vu.nl", "pass")
    resp = await ac.get(f"/api/grading/sessions/{h10_data['session_id']}/grades", headers=auth(token))
    assert resp.status_code == 200


@pytest.mark.anyio
async def test_h10_non_owner_forbidden(ac: AsyncClient, h10_data):
    """A constructor who does not own the test must NOT read its session grades
    (student answers + feedback). (Fixed — H-10.)"""
    token = await login(ac, "h10_bob@vu.nl", "pass")
    resp = await ac.get(f"/api/grading/sessions/{h10_data['session_id']}/grades", headers=auth(token))
    assert resp.status_code == 403, (
        f"non-owner constructor read grades (status {resp.status_code}) — "
        "no assert_test_access on this endpoint"
    )


# ===========================================================================
# H-9 · "Concurrent 401s race into logout via refresh-token rotation"
# Claim depends on the backend INVALIDATING the old refresh token on refresh.
# This backend does NOT rotate/invalidate (no tv bump in refresh_tokens), so the
# described logout cannot occur. These tests DISPROVE the finding-as-described.
# ===========================================================================

@pytest.fixture(scope="function")
async def h9_user(cleanup_database):
    await prisma.users.create(
        data={"email": "h9@vu.nl", "hashed_password": hash_password("pass"),
              "role": UserRole.STUDENT, "is_active": True}
    )
    return {"email": "h9@vu.nl", "password": "pass"}


@pytest.mark.anyio
async def test_h9_old_refresh_token_not_invalidated(ac: AsyncClient, h9_user):
    """The SAME refresh cookie can be replayed multiple times and keeps working —
    i.e. there is no rotation-invalidation. Parallel refreshes therefore all
    succeed and none throws, so the interceptor never reaches logout().

    This passing test DISPROVES H-9's stated mechanism."""
    login_resp = await ac.post("/api/auth/login", json=h9_user)
    assert login_resp.status_code == 200
    original_refresh = login_resp.cookies.get("refresh_token")
    assert original_refresh

    # Replay the ORIGINAL refresh token three times (simulating the parallel
    # refreshes three concurrent 401s would trigger). All must succeed.
    for attempt in range(3):
        r = await ac.post(
            "/api/auth/refresh",
            cookies={"refresh_token": original_refresh},
        )
        assert r.status_code == 200, (
            f"refresh #{attempt} with the original cookie failed ({r.status_code}); "
            "if this ever fails, H-9's logout race becomes possible"
        )


@pytest.mark.anyio
async def test_h9_refresh_does_not_bump_token_version(ac: AsyncClient, h9_user):
    """Refreshing must not bump token_version (which would invalidate siblings).
    Confirms the access tokens minted before/after a refresh both still work."""
    login_resp = await ac.post("/api/auth/login", json=h9_user)
    access_before = login_resp.json()["access_token"]
    refresh_cookie = login_resp.cookies.get("refresh_token")

    # Pre-refresh access token works.
    assert (await ac.get("/api/auth/me", headers=auth(access_before))).status_code == 200
    # Refresh.
    r = await ac.post("/api/auth/refresh", cookies={"refresh_token": refresh_cookie})
    assert r.status_code == 200
    # The PRE-refresh access token STILL works → tv was not bumped → no sibling
    # invalidation → the parallel-refresh logout cannot happen.
    assert (await ac.get("/api/auth/me", headers=auth(access_before))).status_code == 200


# ===========================================================================
# H-5 · In-progress attempt disappears from My Exams when the window closes
# File: backend/app/services/scheduled_sessions_service.py:244
# ===========================================================================

@pytest.fixture(scope="function")
async def h5_data(cleanup_database):
    """A student with a STARTED attempt on a session whose window has just
    closed (ends_at in the past)."""
    admin = await prisma.users.create(
        data={"email": "h5_admin@vu.nl", "hashed_password": hash_password("pass"),
              "role": UserRole.ADMIN, "is_active": True}
    )
    student = await prisma.users.create(
        data={"email": "h5_student@vu.nl", "hashed_password": hash_password("pass"),
              "role": UserRole.STUDENT, "is_active": True}
    )
    test = await prisma.test_definitions.create(
        data={"title": "H5 Exam", "created_by": admin.id,
              "blocks": prisma_lib.Json([]), "duration_minutes": 60}
    )
    course = await prisma.courses.create(
        data={"code": "H5X", "title": "H5 Course", "created_by": admin.id}
    )
    await prisma.course_enrollments.create(
        data={"course_id": course.id, "student_id": student.id, "is_active": True}
    )
    now = datetime.now(timezone.utc)
    # Window has just closed (ended 2 min ago) → ensure_scheduled_session_current
    # will flip it to CLOSED on the next list call.
    scheduled = await prisma.scheduled_exam_sessions.create(
        data={
            "course_id": course.id,
            "test_definition_id": test.id,
            "created_by": admin.id,
            "starts_at": now - timedelta(minutes=62),
            "ends_at": now - timedelta(minutes=2),
            "status": "ACTIVE",
        }
    )
    # The student's attempt is still STARTED (never submitted before the window
    # closed) and not yet auto-finalized (that only happens on GET /sessions/{id}).
    await prisma.exam_sessions.create(
        data={
            "test_definition_id": test.id,
            "student_id": student.id,
            "items": prisma_lib.Json([]),
            "status": "STARTED",
            "started_at": now - timedelta(minutes=60),
            "expires_at": now - timedelta(minutes=2),
            "scheduled_session_id": scheduled.id,
            "session_mode": "ASSIGNED",
        }
    )
    return {"scheduled_id": scheduled.id}


@pytest.mark.anyio
async def test_h5_started_attempt_finalized_after_close(ac: AsyncClient, h5_data):
    """A STARTED attempt on a just-closed session is eagerly finalized when the
    student lists their sessions, so it surfaces in My Grades instead of being
    orphaned. (Fixed — H-5.)"""
    token = await login(ac, "h5_student@vu.nl", "pass")

    # Before listing, the attempt is still STARTED.
    attempt = await prisma.exam_sessions.find_first(
        where={"scheduled_session_id": str(h5_data["scheduled_id"])}
    )
    assert attempt.status == "STARTED"

    resp = await ac.get("/api/student/sessions/", headers=auth(token))
    assert resp.status_code == 200

    # The list call finalized the orphaned attempt: now SUBMITTED + stamped.
    attempt = await prisma.exam_sessions.find_first(
        where={"scheduled_session_id": str(h5_data["scheduled_id"])}
    )
    assert attempt.status == "SUBMITTED", "closed-window STARTED attempt was not finalized"
    assert attempt.submitted_at is not None


# ===========================================================================
# M-8 · Grading delete_many + create_many is not atomic
# File: backend/app/services/grading_service.py:165-171
# A true timing race is flaky to assert; instead we pin the two *structural*
# facts that make the race reachable (deterministic source inspection).
# ===========================================================================

import inspect as _inspect
from pathlib import Path as _Path


def _read_service(rel: str) -> str:
    base = _Path(__file__).resolve().parent.parent / "app" / "services"
    return (base / rel).read_text()


@pytest.mark.anyio
async def test_m8_delete_create_now_in_transaction():
    """The delete_many/create_many pair is now wrapped in an interactive
    transaction (prisma.tx), so a concurrent grader can't observe a half-written
    set. (Fixed — M-8.)"""
    grading_src = _read_service("grading_service.py")
    assert "async with prisma.tx() as tx:" in grading_src
    assert "tx.question_grades.delete_many(" in grading_src
    assert "tx.question_grades.create_many(" in grading_src


# (The companion "no atomic status fence" reachability test was removed once M-8
#  was fixed: the transaction makes the delete/create atomic, so the concurrent
#  half-written-read window the fence was meant to prove is closed.)


# ===========================================================================
# M-7 · question_grades has no index on learning_object_id
# File: prisma/schema.prisma (model question_grades)
# ===========================================================================

def _question_grades_model() -> str:
    schema = (_Path(__file__).resolve().parent.parent.parent / "prisma" / "schema.prisma").read_text()
    start = schema.index("model question_grades")
    return schema[start: schema.index("}", start)]


@pytest.mark.anyio
async def test_m7_learning_object_id_now_indexed():
    """question_grades is now indexed on learning_object_id, matching the real
    analytics query in psychometrics_service.py:314. (Fixed — M-7.)"""
    model = _question_grades_model()
    index_lines = [ln for ln in model.splitlines() if "@@index" in ln]
    assert any("learning_object_id" in ln for ln in index_lines), "lo index missing"
    # The query that justified it still exists.
    psy = _read_service("psychometrics_service.py")
    assert 'where={"learning_object_id": learning_object_id}' in psy


# ===========================================================================
# M-5 · Incident detail silently stripped when stored as a string
# File: backend/app/services/proctoring/monitor_service.py:112 & 169
# ===========================================================================

@pytest.mark.anyio
async def test_m5_string_detail_preserved_under_raw():
    """A legacy non-dict detail is preserved under `_raw` (and logged) rather than
    silently dropped, at both the feed and CSV sites. (Fixed — M-5.)"""
    from app.services.proctoring.monitor_service import _coerce_detail

    legacy = '{"reason":"SEB integrity failure"}'  # a raw JSON string, not a dict
    assert _coerce_detail(legacy) == {"_raw": legacy}   # preserved, not dropped
    assert _coerce_detail({"a": 1}) == {"a": 1}         # dicts pass through
    assert _coerce_detail(None) == {}                   # None → empty

    # Both call sites now route through the shared helper (no lossy inline form left).
    mon = _read_service("proctoring/monitor_service.py")
    assert "if isinstance(r.detail, dict) else {}" not in mon
    assert mon.count("_coerce_detail(r.detail)") >= 2


# ===========================================================================
# M-9 · Heartbeat autoclaim always rescans from stream start
# File: backend/app/services/heartbeat_ingestion/worker.py:171-178
# ===========================================================================

@pytest.mark.anyio
async def test_m9_autoclaim_cursor_persisted():
    """xautoclaim now resumes from a persisted module-level cursor and advances it
    from result[0] each cycle, instead of always rescanning from '0-0'.
    (Fixed — M-9.)"""
    worker = (_Path(__file__).resolve().parent.parent
              / "app" / "services" / "heartbeat_ingestion" / "worker.py").read_text()
    assert "_autoclaim_cursor = \"0-0\"" in worker, "module-level cursor seeded"
    assert "start_id=_autoclaim_cursor" in worker, "autoclaim resumes from the cursor"
    # The cursor advances from result[0] (the next_start_id) each cycle.
    assert "result[0]" in worker
    assert "global _autoclaim_cursor" in worker

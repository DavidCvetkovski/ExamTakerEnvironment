"""
Tests for the grading API endpoints.

Covers:
- GET /grading/sessions/{id}/grades     — instructor access
- PATCH /grading/grades/{id}            — manual essay grading
- POST /grading/tests/{id}/publish-results  — admin-only publication
- POST /grading/tests/{id}/unpublish-results
- GET /grading/my-results               — student published results
- GET /grading/my-results/{session_id}  — student result detail
- RBAC enforcement (students blocked from instructor endpoints)
"""
import pytest
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient
from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole
from app.models.item_version import ItemStatus, QuestionType
import prisma as prisma_lib

ADMIN_EMAIL = "results_admin@vu.nl"
STUDENT_EMAIL = "results_student@vu.nl"
PASS = "testpass"


async def login(ac: AsyncClient, email: str, password: str) -> str:
    resp = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="function")
async def full_grading_setup(cleanup_database):
    """
    Creates admin + student + test + submitted session + auto-grades it.
    Returns IDs needed by the tests.
    """
    now = datetime.now(timezone.utc)
    admin = await prisma.users.create(data={
        "email": ADMIN_EMAIL,
        "hashed_password": hash_password(PASS),
        "role": UserRole.ADMIN,
    })
    student = await prisma.users.create(data={
        "email": STUDENT_EMAIL,
        "hashed_password": hash_password(PASS),
        "role": UserRole.STUDENT,
    })

    bank = await prisma.item_banks.create(data={"name": "Results Bank", "created_by": admin.id})

    # MCQ item
    mcq_lo = await prisma.learning_objects.create(data={"bank_id": bank.id, "created_by": admin.id})
    mcq_iv = await prisma.item_versions.create(data={
        "learning_object_id": mcq_lo.id,
        "version_number": 1,
        "status": ItemStatus.APPROVED,
        "question_type": QuestionType.MULTIPLE_CHOICE,
        "content": prisma_lib.Json({"text": "Q1"}),
        "options": prisma_lib.Json([{"text": "A", "is_correct": True}, {"text": "B", "is_correct": False}]),
        "created_by": admin.id,
    })

    # Essay item
    essay_lo = await prisma.learning_objects.create(data={"bank_id": bank.id, "created_by": admin.id})
    essay_iv = await prisma.item_versions.create(data={
        "learning_object_id": essay_lo.id,
        "version_number": 1,
        "status": ItemStatus.APPROVED,
        "question_type": QuestionType.ESSAY,
        "content": prisma_lib.Json({"text": "Explain X"}),
        "options": prisma_lib.Json([]),
        "created_by": admin.id,
    })

    test_def = await prisma.test_definitions.create(data={
        "title": "Results Test",
        "created_by": admin.id,
        "blocks": prisma_lib.Json([{"title": "S1", "rules": []}]),
        "duration_minutes": 60,
        "scoring_config": prisma_lib.Json({
            "pass_percentage": 55.0,
            "grade_boundaries": [
                {"min_percentage": 55, "grade": "Pass"},
                {"min_percentage": 0, "grade": "Fail"},
            ],
            "essay_points": {essay_lo.id: 10.0},
        }),
    })

    # Manually create submitted session with frozen snapshot
    items_snapshot = [
        {
            "learning_object_id": mcq_lo.id,
            "item_version_id": mcq_iv.id,
            "question_type": "MULTIPLE_CHOICE",
            "content": {"raw_html": "<p>Q1</p>"},
            "options": [{"text": "A", "is_correct": True}, {"text": "B", "is_correct": False}],
        },
        {
            "learning_object_id": essay_lo.id,
            "item_version_id": essay_iv.id,
            "question_type": "ESSAY",
            "content": {"text": "Explain X"},
        },
    ]
    session = await prisma.exam_sessions.create(data={
        "test_definition_id": test_def.id,
        "student_id": student.id,
        "items": prisma_lib.Json(items_snapshot),
        "status": "SUBMITTED",
        "started_at": now - timedelta(hours=1),
        "submitted_at": now,
        "expires_at": now + timedelta(hours=1),
        "session_mode": "ASSIGNED",
    })

    # Interaction events (MCQ: correct; Essay: submitted)
    await prisma.interaction_events.create(data={
        "session_id": session.id,
        "learning_object_id": mcq_lo.id,
        "event_type": "ANSWER_CHANGE",
        "payload": prisma_lib.Json({"selected_option_index": 0}),
    })
    await prisma.interaction_events.create(data={
        "session_id": session.id,
        "learning_object_id": essay_lo.id,
        "event_type": "ANSWER_CHANGE",
        "payload": prisma_lib.Json({"essay_text": "Explanation here"}),
    })

    # Auto-grade the session
    from app.services.grading_service import auto_grade_session
    from uuid import UUID
    await auto_grade_session(UUID(session.id))

    # Get the essay grade_id
    grades = await prisma.question_grades.find_many(where={"session_id": session.id})
    essay_grade = next(g for g in grades if not g.is_auto_graded)
    mcq_grade = next(g for g in grades if g.is_auto_graded)

    return {
        "admin": admin,
        "student": student,
        "test_def": test_def,
        "session": session,
        "essay_lo": essay_lo,
        "mcq_lo": mcq_lo,
        "essay_grade_id": essay_grade.id,
        "mcq_grade_id": mcq_grade.id,
    }


# ─── Instructor: get grades ───────────────────────────────────────────────────

@pytest.mark.anyio
async def test_get_session_grades_instructor(ac: AsyncClient, full_grading_setup):
    s = full_grading_setup
    token = await login(ac, ADMIN_EMAIL, PASS)
    resp = await ac.get(
        f"/api/grading/sessions/{s['session'].id}/grades",
        headers=auth(token)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    grade_ids = [g["id"] for g in data]
    assert s["essay_grade_id"] in grade_ids
    assert s["mcq_grade_id"] in grade_ids
    mcq_grade = next(g for g in data if g["id"] == s["mcq_grade_id"])
    assert mcq_grade["question_type"] == "MULTIPLE_CHOICE"
    assert mcq_grade["question_content"]["raw_html"] == "<p>Q1</p>"
    assert mcq_grade["question_options"][0]["text"] == "A"


@pytest.mark.anyio
async def test_get_session_grades_student_blocked(ac: AsyncClient, full_grading_setup):
    """Students cannot access instructor grade breakdown."""
    s = full_grading_setup
    token = await login(ac, STUDENT_EMAIL, PASS)
    resp = await ac.get(
        f"/api/grading/sessions/{s['session'].id}/grades",
        headers=auth(token)
    )
    assert resp.status_code == 403


# ─── Manual grading ───────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_submit_manual_grade_valid(ac: AsyncClient, full_grading_setup):
    """Admin can grade essay; recalculates aggregate to FULLY_GRADED."""
    s = full_grading_setup
    token = await login(ac, ADMIN_EMAIL, PASS)

    resp = await ac.patch(
        f"/api/grading/grades/{s['essay_grade_id']}",
        json={"points_awarded": 7.0, "feedback": "Good explanation"},
        headers=auth(token)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["points_awarded"] == 7.0
    assert body["feedback"] == "Good explanation"

    # Session result should now be FULLY_GRADED
    sr = await prisma.session_results.find_unique(where={"session_id": s["session"].id})
    assert sr.grading_status == "FULLY_GRADED"
    assert sr.questions_graded == 2


@pytest.mark.anyio
async def test_submit_manual_grade_exceeds_possible(ac: AsyncClient, full_grading_setup):
    """Grading above max points returns 400."""
    s = full_grading_setup
    token = await login(ac, ADMIN_EMAIL, PASS)

    resp = await ac.patch(
        f"/api/grading/grades/{s['essay_grade_id']}",
        json={"points_awarded": 999.0},
        headers=auth(token)
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_submit_manual_grade_negative(ac: AsyncClient, full_grading_setup):
    """Grading with negative points returns 400."""
    s = full_grading_setup
    token = await login(ac, ADMIN_EMAIL, PASS)

    resp = await ac.patch(
        f"/api/grading/grades/{s['essay_grade_id']}",
        json={"points_awarded": -1.0},
        headers=auth(token)
    )
    assert resp.status_code == 422  # Pydantic validation


@pytest.mark.anyio
async def test_student_cannot_submit_grade(ac: AsyncClient, full_grading_setup):
    """Students are blocked from the manual grading endpoint."""
    s = full_grading_setup
    token = await login(ac, STUDENT_EMAIL, PASS)
    resp = await ac.patch(
        f"/api/grading/grades/{s['essay_grade_id']}",
        json={"points_awarded": 5.0},
        headers=auth(token)
    )
    assert resp.status_code == 403


# ─── Publication ─────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_publish_blocked_when_partially_graded(ac: AsyncClient, full_grading_setup):
    """Cannot publish while essay is still ungraded."""
    s = full_grading_setup
    token = await login(ac, ADMIN_EMAIL, PASS)

    resp = await ac.post(
        f"/api/grading/tests/{s['test_def'].id}/publish-results",
        headers=auth(token)
    )
    assert resp.status_code == 409


@pytest.mark.anyio
async def test_full_publish_unpublish_flow(ac: AsyncClient, full_grading_setup):
    """Grade essay → publish → student sees result → unpublish → 403."""
    s = full_grading_setup
    admin_token = await login(ac, ADMIN_EMAIL, PASS)
    student_token = await login(ac, STUDENT_EMAIL, PASS)

    # Grade the essay to make FULLY_GRADED
    await ac.patch(
        f"/api/grading/grades/{s['essay_grade_id']}",
        json={"points_awarded": 8.0, "feedback": "Well done"},
        headers=auth(admin_token)
    )

    # Publish results
    pub_resp = await ac.post(
        f"/api/grading/tests/{s['test_def'].id}/publish-results",
        headers=auth(admin_token)
    )
    assert pub_resp.status_code == 200
    assert pub_resp.json()["published"] == 1

    # Student can now see their own result
    my_resp = await ac.get("/api/grading/my-results", headers=auth(student_token))
    assert my_resp.status_code == 200
    results = my_resp.json()
    assert len(results) == 1
    assert results[0]["session_id"] == s["session"].id

    # Student can see detail
    detail_resp = await ac.get(
        f"/api/grading/my-results/{s['session'].id}",
        headers=auth(student_token)
    )
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["session_id"] == s["session"].id
    assert "question_results" in detail
    assert len(detail["question_results"]) == 2
    mcq_detail = next(q for q in detail["question_results"] if q["question_type"] == "MULTIPLE_CHOICE")
    assert mcq_detail["question_content"]["raw_html"] == "<p>Q1</p>"
    assert mcq_detail["question_options"][0]["text"] == "A"

    # Unpublish
    unpub_resp = await ac.post(
        f"/api/grading/tests/{s['test_def'].id}/unpublish-results",
        headers=auth(admin_token)
    )
    assert unpub_resp.status_code == 200

    # Student gets 403 after unpublish
    detail_resp2 = await ac.get(
        f"/api/grading/my-results/{s['session'].id}",
        headers=auth(student_token)
    )
    assert detail_resp2.status_code == 403


@pytest.mark.anyio
async def test_set_cut_score_rederives_pass_fail(ac: AsyncClient, full_grading_setup):
    """Setting a cut score persists it and re-derives passed for results."""
    s = full_grading_setup
    admin_token = await login(ac, ADMIN_EMAIL, PASS)

    # Grade the essay so the session has a final percentage.
    await ac.patch(
        f"/api/grading/grades/{s['essay_grade_id']}",
        json={"points_awarded": 8.0, "feedback": "ok"},
        headers=auth(admin_token),
    )

    result = await prisma.session_results.find_unique(where={"session_id": s["session"].id})
    pct = result.percentage

    # Cut score just above this session's percentage → should fail.
    above = min(100, pct + 5)
    resp = await ac.patch(
        f"/api/grading/tests/{s['test_def'].id}/cut-score",
        json={"cut_score": above},
        headers=auth(admin_token),
    )
    assert resp.status_code == 200
    refreshed = await prisma.session_results.find_unique(where={"session_id": s["session"].id})
    assert refreshed.passed is False

    # Cut score at/below the percentage → should pass.
    below = max(0, pct - 5)
    await ac.patch(
        f"/api/grading/tests/{s['test_def'].id}/cut-score",
        json={"cut_score": below},
        headers=auth(admin_token),
    )
    refreshed = await prisma.session_results.find_unique(where={"session_id": s["session"].id})
    assert refreshed.passed is True


@pytest.mark.anyio
async def test_student_cannot_set_cut_score(ac: AsyncClient, full_grading_setup):
    s = full_grading_setup
    token = await login(ac, STUDENT_EMAIL, PASS)
    resp = await ac.patch(
        f"/api/grading/tests/{s['test_def'].id}/cut-score",
        json={"cut_score": 50},
        headers=auth(token),
    )
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_publish_grades_only_blocks_detail(ac: AsyncClient, full_grading_setup):
    """Publishing with details_visible=false lets the student see the grade in
    the list but blocks the per-question detail with a 403."""
    s = full_grading_setup
    admin_token = await login(ac, ADMIN_EMAIL, PASS)
    student_token = await login(ac, STUDENT_EMAIL, PASS)

    await ac.patch(
        f"/api/grading/grades/{s['essay_grade_id']}",
        json={"points_awarded": 8.0, "feedback": "Well done"},
        headers=auth(admin_token),
    )

    pub_resp = await ac.post(
        f"/api/grading/tests/{s['test_def'].id}/publish-results",
        json={"details_visible": False},
        headers=auth(admin_token),
    )
    assert pub_resp.status_code == 200

    # Grade is visible in the list, flagged as grades-only.
    my_resp = await ac.get("/api/grading/my-results", headers=auth(student_token))
    assert my_resp.status_code == 200
    assert my_resp.json()[0]["details_visible"] is False

    # The per-question detail is blocked.
    detail_resp = await ac.get(
        f"/api/grading/my-results/{s['session'].id}",
        headers=auth(student_token),
    )
    assert detail_resp.status_code == 403


@pytest.mark.anyio
async def test_student_my_results_empty_before_publish(ac: AsyncClient, full_grading_setup):
    """Student receives empty list if no results published yet."""
    s = full_grading_setup
    token = await login(ac, STUDENT_EMAIL, PASS)
    resp = await ac.get("/api/grading/my-results", headers=auth(token))
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.anyio
async def test_grading_overview_visible_to_instructor(ac: AsyncClient, full_grading_setup):
    """Instructor can load grading overview with all submitted sessions."""
    s = full_grading_setup
    token = await login(ac, ADMIN_EMAIL, PASS)
    resp = await ac.get(
        f"/api/grading/tests/{s['test_def'].id}/grading-overview",
        headers=auth(token)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["session_id"] == s["session"].id
    assert data[0]["grading_status"] == "PARTIALLY_GRADED"


@pytest.mark.anyio
async def test_csv_export_admin_only(ac: AsyncClient, full_grading_setup):
    """Only admin can export CSV; student gets 403."""
    s = full_grading_setup

    student_token = await login(ac, STUDENT_EMAIL, PASS)
    rsp = await ac.get(
        f"/api/grading/tests/{s['test_def'].id}/export",
        headers=auth(student_token)
    )
    assert rsp.status_code == 403

    admin_token = await login(ac, ADMIN_EMAIL, PASS)
    rsp = await ac.get(
        f"/api/grading/tests/{s['test_def'].id}/export",
        headers=auth(admin_token)
    )
    assert rsp.status_code == 200
    assert "text/csv" in rsp.headers["content-type"]
    # Should contain header row
    assert b"email" in rsp.content


# ---------------------------------------------------------------------------
# Manual grading boundary + idempotency edges
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_grade_with_unknown_grade_id_returns_404(ac: AsyncClient, full_grading_setup):
    from uuid import uuid4
    token = await login(ac, ADMIN_EMAIL, PASS)
    resp = await ac.patch(
        f"/api/grading/grades/{uuid4()}",
        json={"points_awarded": 1.0, "feedback": "x"},
        headers=auth(token),
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_grade_can_be_overwritten(ac: AsyncClient, full_grading_setup):
    """Resubmitting a manual grade with new points should replace the old
    value (no UNIQUE constraint blocks the update). Tests idempotency."""
    s = full_grading_setup
    token = await login(ac, ADMIN_EMAIL, PASS)

    first = await ac.patch(
        f"/api/grading/grades/{s['essay_grade_id']}",
        json={"points_awarded": 2.0, "feedback": "first pass"},
        headers=auth(token),
    )
    assert first.status_code in (200, 204)

    second = await ac.patch(
        f"/api/grading/grades/{s['essay_grade_id']}",
        json={"points_awarded": 7.5, "feedback": "revised after appeal"},
        headers=auth(token),
    )
    assert second.status_code in (200, 204)

    # Verify the second write won by reading the row directly.
    grade = await prisma.question_grades.find_unique(
        where={"id": s["essay_grade_id"]}
    )
    assert grade.points_awarded == 7.5
    assert grade.feedback == "revised after appeal"


@pytest.mark.anyio
async def test_grade_zero_points_is_valid(ac: AsyncClient, full_grading_setup):
    """0 is a valid manual grade — not the same as 'ungraded'."""
    s = full_grading_setup
    token = await login(ac, ADMIN_EMAIL, PASS)
    resp = await ac.patch(
        f"/api/grading/grades/{s['essay_grade_id']}",
        json={"points_awarded": 0.0, "feedback": "no points"},
        headers=auth(token),
    )
    assert resp.status_code in (200, 204)
    grade = await prisma.question_grades.find_unique(where={"id": s["essay_grade_id"]})
    assert grade.points_awarded == 0.0
    # 'feedback' set ⇒ no longer in the ungraded queue
    assert grade.feedback == "no points"


@pytest.mark.anyio
async def test_grade_without_feedback_is_valid(ac: AsyncClient, full_grading_setup):
    """Grading an essay without providing feedback is valid and removes it from the ungraded counts and queue."""
    s = full_grading_setup
    token = await login(ac, ADMIN_EMAIL, PASS)

    # 1. Check initial ungraded counts
    sessions_resp = await ac.get("/api/grading/sessions", headers=auth(token))
    assert sessions_resp.status_code == 200
    session_data = next(sess for sess in sessions_resp.json() if sess["session_id"] == s["session"].id)
    assert session_data["ungraded_response_count"] == 1

    # 2. Check initial grading queue size
    queue_resp = await ac.get(f"/api/grading/tests/{s['test_def'].id}/grading-queue", headers=auth(token))
    assert queue_resp.status_code == 200
    queue = queue_resp.json()
    assert len(queue) == 1
    assert queue[0]["grade_id"] == s["essay_grade_id"]

    # Grade the essay with points but NO feedback
    resp = await ac.patch(
        f"/api/grading/grades/{s['essay_grade_id']}",
        json={"points_awarded": 5.0, "feedback": None},
        headers=auth(token),
    )
    assert resp.status_code in (200, 204)

    # Verify the grade is updated, and feedback remains None/null
    grade = await prisma.question_grades.find_unique(where={"id": s["essay_grade_id"]})
    assert grade.points_awarded == 5.0
    assert grade.feedback is None
    assert grade.is_correct is not None  # Should be boolean (False since 5 < 10)

    # Check that ungraded counts updated to 0
    sessions_resp = await ac.get("/api/grading/sessions", headers=auth(token))
    assert sessions_resp.status_code == 200
    session_data = next(sess for sess in sessions_resp.json() if sess["session_id"] == s["session"].id)
    assert session_data["ungraded_response_count"] == 0

    # Check that grading queue is now empty
    queue_resp = await ac.get(f"/api/grading/tests/{s['test_def'].id}/grading-queue", headers=auth(token))
    assert queue_resp.status_code == 200
    queue = queue_resp.json()
    assert len(queue) == 0


# ---------------------------------------------------------------------------
# Publish / unpublish edges
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_publish_when_nothing_to_publish_returns_zero(ac: AsyncClient, full_grading_setup):
    """First publish flips the session to published; second one finds no
    unpublished rows. The endpoint should not 4xx — it returns published=0."""
    s = full_grading_setup
    token = await login(ac, ADMIN_EMAIL, PASS)

    # Grade the essay so the session is FULLY_GRADED.
    await ac.patch(
        f"/api/grading/grades/{s['essay_grade_id']}",
        json={"points_awarded": 8.0, "feedback": "ok"},
        headers=auth(token),
    )
    first = await ac.post(
        f"/api/grading/tests/{s['test_def'].id}/publish-results",
        headers=auth(token),
    )
    assert first.status_code == 200

    second = await ac.post(
        f"/api/grading/tests/{s['test_def'].id}/publish-results",
        headers=auth(token),
    )
    assert second.status_code == 200
    assert second.json().get("published", 0) == 0


@pytest.mark.anyio
async def test_unpublish_then_republish_round_trip(ac: AsyncClient, full_grading_setup):
    """Admin can retract published results; the row's is_published flips
    back to False and re-publishing increments the count again."""
    s = full_grading_setup
    token = await login(ac, ADMIN_EMAIL, PASS)
    await ac.patch(
        f"/api/grading/grades/{s['essay_grade_id']}",
        json={"points_awarded": 8.0, "feedback": "ok"},
        headers=auth(token),
    )
    await ac.post(
        f"/api/grading/tests/{s['test_def'].id}/publish-results",
        headers=auth(token),
    )

    unpub = await ac.post(
        f"/api/grading/tests/{s['test_def'].id}/unpublish-results",
        headers=auth(token),
    )
    assert unpub.status_code in (200, 204)

    # Row should be unpublished now.
    sr = await prisma.session_results.find_unique(
        where={"session_id": s["session"].id}
    )
    assert sr.is_published is False

    # Republishing now has work to do.
    repub = await ac.post(
        f"/api/grading/tests/{s['test_def'].id}/publish-results",
        headers=auth(token),
    )
    assert repub.json().get("published", 0) >= 1


@pytest.mark.anyio
async def test_student_blocked_from_unpublish(ac: AsyncClient, full_grading_setup):
    s = full_grading_setup
    token = await login(ac, STUDENT_EMAIL, PASS)
    resp = await ac.post(
        f"/api/grading/tests/{s['test_def'].id}/unpublish-results",
        headers=auth(token),
    )
    assert resp.status_code in (401, 403)


@pytest.mark.anyio
async def test_student_blocked_from_csv_export(ac: AsyncClient, full_grading_setup):
    s = full_grading_setup
    token = await login(ac, STUDENT_EMAIL, PASS)
    resp = await ac.get(
        f"/api/grading/tests/{s['test_def'].id}/export",
        headers=auth(token),
    )
    assert resp.status_code in (401, 403)


@pytest.mark.anyio
async def test_student_cannot_read_other_students_result(ac: AsyncClient, full_grading_setup):
    """Detail endpoint must check ownership — even after publish, another
    student must not be able to fetch a session that isn't theirs."""
    s = full_grading_setup
    token = await login(ac, ADMIN_EMAIL, PASS)
    await ac.patch(
        f"/api/grading/grades/{s['essay_grade_id']}",
        json={"points_awarded": 8.0, "feedback": "ok"},
        headers=auth(token),
    )
    await ac.post(
        f"/api/grading/tests/{s['test_def'].id}/publish-results",
        headers=auth(token),
    )

    # Spin up another student and try to read the first student's result.
    other = await prisma.users.create(data={
        "email": "other_student@vu.nl",
        "hashed_password": hash_password(PASS),
        "role": UserRole.STUDENT,
    })
    other_token = await login(ac, other.email, PASS)
    resp = await ac.get(
        f"/api/grading/my-results/{s['session'].id}",
        headers=auth(other_token),
    )
    assert resp.status_code in (403, 404)

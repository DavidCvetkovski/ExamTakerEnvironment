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
            "options": [{"text": "A", "is_correct": True}, {"text": "B", "is_correct": False}],
        },
        {
            "learning_object_id": essay_lo.id,
            "item_version_id": essay_iv.id,
            "question_type": "ESSAY",
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

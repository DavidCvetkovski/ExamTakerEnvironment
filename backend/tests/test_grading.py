"""
Tests for the auto-grading engine (grading_service.py).

Covers:
- MCQ single: correct, incorrect, negative marking
- Multiple response: ALL_OR_NOTHING, PARTIAL_CREDIT
- Grade boundary application
- auto_grade_session: MCQ-only session creates FULLY_GRADED result
- auto_grade_session: Mixed session (MCQ + essay) creates PARTIALLY_GRADED result
"""
import pytest
from app.services.grading_service import (
    _get_correct_options,
    grade_mcq_single,
    grade_multiple_response,
    apply_grade_boundaries,
)
from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole
from app.models.item_version import ItemStatus, QuestionType
from datetime import datetime, timedelta, timezone
import prisma as prisma_lib

pytestmark = pytest.mark.anyio

# ─── Unit tests: scoring functions ───────────────────────────────────────────

class TestGradeMcqSingle:
    async def test_correct_answer(self):
        pts, ok = grade_mcq_single({"selected_option_index": 2}, [2])
        assert pts == 1.0
        assert ok is True

    async def test_wrong_answer_no_penalty(self):
        pts, ok = grade_mcq_single({"selected_option_index": 0}, [2])
        assert pts == 0.0
        assert ok is False

    async def test_wrong_answer_with_neg_marking(self):
        pts, ok = grade_mcq_single(
            {"selected_option_index": 0}, [2],
            negative_marking=True, penalty=0.25
        )
        assert pts == -0.25
        assert ok is False

    async def test_no_answer_submitted(self):
        pts, ok = grade_mcq_single({}, [1])
        assert pts == 0.0
        assert ok is False

    async def test_penalty_capped_at_minus_one(self):
        pts, ok = grade_mcq_single(
            {"selected_option_index": 1}, [0],
            negative_marking=True, penalty=2.0
        )
        assert pts == -1.0

    async def test_correct_among_multiple_correct_options(self):
        pts, ok = grade_mcq_single({"selected_option_index": 1}, [1, 3])
        assert pts == 1.0
        assert ok is True


class TestGradeMultipleResponse:
    async def test_all_or_nothing_perfect(self):
        pts, ok = grade_multiple_response(
            {"selected_option_indices": [0, 2]},
            [0, 2],
            strategy="ALL_OR_NOTHING"
        )
        assert pts == 1.0
        assert ok is True

    async def test_all_or_nothing_partial_selected(self):
        pts, ok = grade_multiple_response(
            {"selected_option_indices": [0]},
            [0, 2],
            strategy="ALL_OR_NOTHING"
        )
        assert pts == 0.0
        assert ok is False

    async def test_partial_credit_half_correct(self):
        # 1 of 2 correct options selected, 0 wrong → 0.5 pts
        pts, ok = grade_multiple_response(
            {"selected_option_indices": [0]},
            [0, 1],
            strategy="PARTIAL_CREDIT",
            points_possible=1.0
        )
        assert pts == 0.5
        assert ok is False

    async def test_partial_credit_wrong_selection_penalty(self):
        # 1 correct, 1 wrong → 0.5 - 0.5 = 0 (clamped)
        pts, ok = grade_multiple_response(
            {"selected_option_indices": [0, 3]},
            [0, 1],
            strategy="PARTIAL_CREDIT",
            negative_marking=True,
            points_possible=1.0
        )
        assert pts == 0.0

    async def test_partial_credit_all_correct(self):
        pts, ok = grade_multiple_response(
            {"selected_option_indices": [0, 1]},
            [0, 1],
            strategy="PARTIAL_CREDIT",
            points_possible=1.0
        )
        assert pts == 1.0
        assert ok is True

    async def test_no_answer_submitted(self):
        pts, ok = grade_multiple_response({}, [0, 1])
        assert pts == 0.0
        assert ok is False

    async def test_no_correct_options_defined(self):
        pts, ok = grade_multiple_response({"selected_option_indices": [0]}, [])
        assert pts == 0.0

    async def test_points_capped_at_possible(self):
        pts, _ = grade_multiple_response(
            {"selected_option_indices": [0]},
            [0],
            strategy="PARTIAL_CREDIT",
            points_possible=5.0
        )
        assert pts <= 5.0


class TestApplyGradeBoundaries:
    BOUNDARIES = [
        {"min_percentage": 85.0, "grade": "A"},
        {"min_percentage": 70.0, "grade": "B"},
        {"min_percentage": 55.0, "grade": "Pass"},
        {"min_percentage": 0.0,  "grade": "Fail"},
    ]

    async def test_above_highest_threshold(self):
        grade, passed = apply_grade_boundaries(90.0, self.BOUNDARIES)
        assert grade == "A"
        assert passed is True

    async def test_exactly_at_pass_threshold(self):
        grade, passed = apply_grade_boundaries(55.0, self.BOUNDARIES)
        assert grade == "Pass"
        assert passed is True

    async def test_just_below_pass_threshold(self):
        grade, passed = apply_grade_boundaries(54.9, self.BOUNDARIES)
        assert grade == "Fail"
        assert passed is False

    async def test_zero_score(self):
        grade, passed = apply_grade_boundaries(0.0, self.BOUNDARIES)
        assert grade == "Fail"
        assert passed is False

    async def test_empty_boundaries_returns_fail(self):
        grade, passed = apply_grade_boundaries(80.0, [])
        assert grade == "Fail"
        assert passed is False


class TestCorrectOptionExtraction:
    async def test_accepts_choices_object_shape(self):
        correct = _get_correct_options({
            "question_type": "MULTIPLE_CHOICE",
            "choices": [
                {"text": "A", "is_correct": False},
                {"text": "B", "is_correct": True},
                {"text": "C", "is_correct": False},
            ],
        })
        assert correct == [1]

    async def test_accepts_legacy_list_shape(self):
        correct = _get_correct_options([
            {"text": "A", "is_correct": False},
            {"text": "B", "is_correct": True},
        ])
        assert correct == [1]


# ─── Integration tests: auto_grade_session ───────────────────────────────────

ADMIN_EMAIL = "grading_admin@vu.nl"
STUDENT_EMAIL = "grading_student@vu.nl"
PASS = "testpass"


@pytest.fixture(scope="function")
async def grading_setup(cleanup_database):
    """Create admin + student + item bank + MCQ test definition."""
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

    bank = await prisma.item_banks.create(data={
        "name": "Grading Bank",
        "created_by": admin.id,
    })

    # MCQ learning object
    mcq_lo = await prisma.learning_objects.create(data={
        "bank_id": bank.id,
        "created_by": admin.id,
    })
    mcq_iv = await prisma.item_versions.create(data={
        "learning_object_id": mcq_lo.id,
        "version_number": 1,
        "status": ItemStatus.APPROVED,
        "question_type": QuestionType.MULTIPLE_CHOICE,
        "content": prisma_lib.Json({"text": "What is 2+2?"}),
        "options": prisma_lib.Json([
            {"text": "3", "is_correct": False},
            {"text": "4", "is_correct": True},
            {"text": "5", "is_correct": False},
        ]),
        "created_by": admin.id,
    })

    # Essay learning object
    essay_lo = await prisma.learning_objects.create(data={
        "bank_id": bank.id,
        "created_by": admin.id,
    })
    essay_iv = await prisma.item_versions.create(data={
        "learning_object_id": essay_lo.id,
        "version_number": 1,
        "status": ItemStatus.APPROVED,
        "question_type": QuestionType.ESSAY,
        "content": prisma_lib.Json({"text": "Describe recursion."}),
        "options": prisma_lib.Json([]),
        "created_by": admin.id,
    })

    # Test definition (MCQ only)
    mcq_test = await prisma.test_definitions.create(data={
        "title": "MCQ Only Test",
        "created_by": admin.id,
        "blocks": prisma_lib.Json([{
            "title": "Section 1",
            "rules": [{"rule_type": "FIXED", "learning_object_id": mcq_lo.id}]
        }]),
        "duration_minutes": 60,
        "scoring_config": prisma_lib.Json({
            "pass_percentage": 55.0,
            "negative_marking": False,
            "negative_marking_penalty": 0.25,
            "multiple_response_strategy": "PARTIAL_CREDIT",
            "grade_boundaries": [
                {"min_percentage": 55.0, "grade": "Pass"},
                {"min_percentage": 0.0, "grade": "Fail"},
            ],
        }),
    })

    # Test definition (MCQ + Essay)
    mixed_test = await prisma.test_definitions.create(data={
        "title": "Mixed Test",
        "created_by": admin.id,
        "blocks": prisma_lib.Json([{
            "title": "Section 1",
            "rules": [
                {"rule_type": "FIXED", "learning_object_id": mcq_lo.id},
                {"rule_type": "FIXED", "learning_object_id": essay_lo.id},
            ]
        }]),
        "duration_minutes": 90,
    })

    return {
        "admin": admin,
        "student": student,
        "mcq_lo": mcq_lo,
        "mcq_iv": mcq_iv,
        "essay_lo": essay_lo,
        "essay_iv": essay_iv,
        "mcq_test": mcq_test,
        "mixed_test": mixed_test,
    }


async def _create_submitted_session(
    test_id: str,
    student_id: str,
    items_snapshot: list,
    answer_events: list,
) -> str:
    """Helper to create a SUBMITTED exam_session with interaction events."""
    now = datetime.now(timezone.utc)
    session = await prisma.exam_sessions.create(data={
        "test_definition_id": test_id,
        "student_id": student_id,
        "items": prisma_lib.Json(items_snapshot),
        "status": "SUBMITTED",
        "started_at": now - timedelta(hours=1),
        "submitted_at": now,
        "expires_at": now + timedelta(hours=1),
        "session_mode": "ASSIGNED",
    })
    for ev in answer_events:
        await prisma.interaction_events.create(data={
            "session_id": session.id,
            "learning_object_id": ev["lo_id"],
            "event_type": "ANSWER_CHANGE",
            "payload": prisma_lib.Json(ev["payload"]),
        })
    return session.id


@pytest.mark.anyio
async def test_auto_grade_mcq_correct_answer(grading_setup):
    """Correct MCQ answer yields 1.0 pts, AUTO_GRADED status."""
    from app.services.grading_service import auto_grade_session
    from uuid import UUID
    s = grading_setup

    items = [{
        "learning_object_id": s["mcq_lo"].id,
        "item_version_id": s["mcq_iv"].id,
        "question_type": "MULTIPLE_CHOICE",
        "content": {"text": "What is 2+2?"},
        "options": [
            {"text": "3", "is_correct": False},
            {"text": "4", "is_correct": True},
            {"text": "5", "is_correct": False},
        ],
    }]
    # Answer: option index 1 (correct)
    session_id = await _create_submitted_session(
        s["mcq_test"].id, s["student"].id, items,
        [{"lo_id": s["mcq_lo"].id, "payload": {"selected_option_index": 1}}],
    )

    result = await auto_grade_session(UUID(session_id))

    assert result["graded"] == 1
    assert result["pending_manual"] == 0
    assert result["total_points"] == 1.0
    assert result["grading_status"] == "AUTO_GRADED"

    # Verify question_grade record
    grade = await prisma.question_grades.find_first(where={"session_id": session_id})
    assert grade is not None
    assert grade.points_awarded == 1.0
    assert grade.is_correct is True
    assert grade.is_auto_graded is True

    # Verify session_result
    sr = await prisma.session_results.find_unique(where={"session_id": session_id})
    assert sr is not None
    assert sr.grading_status == "AUTO_GRADED"
    assert sr.letter_grade == "Pass"
    assert sr.passed is True


@pytest.mark.anyio
async def test_auto_grade_mcq_correct_answer_from_choices_object_snapshot(grading_setup):
    """The live authored snapshot shape uses options.choices, which must still auto-grade correctly."""
    from app.services.grading_service import auto_grade_session
    from uuid import UUID
    s = grading_setup

    items = [{
        "learning_object_id": s["mcq_lo"].id,
        "item_version_id": s["mcq_iv"].id,
        "question_type": "MULTIPLE_CHOICE",
        "content": {"raw_html": "<p>What is 2+2?</p>"},
        "options": {
            "question_type": "MULTIPLE_CHOICE",
            "choices": [
                {"id": "A", "text": "3", "is_correct": False, "weight": 1.0},
                {"id": "B", "text": "4", "is_correct": True, "weight": 1.0},
                {"id": "C", "text": "5", "is_correct": False, "weight": 1.0},
            ],
        },
    }]

    session_id = await _create_submitted_session(
        s["mcq_test"].id,
        s["student"].id,
        items,
        [{"lo_id": s["mcq_lo"].id, "payload": {"selected_option_index": 1}}],
    )

    result = await auto_grade_session(UUID(session_id))

    assert result["total_points"] == 1.0
    assert result["grading_status"] == "AUTO_GRADED"

    grade = await prisma.question_grades.find_first(where={"session_id": session_id})
    assert grade is not None
    assert grade.points_awarded == 1.0
    assert grade.is_correct is True


@pytest.mark.anyio
async def test_auto_grade_mcq_wrong_answer(grading_setup):
    """Wrong MCQ answer yields 0.0 pts, is_correct=False."""
    from app.services.grading_service import auto_grade_session
    from uuid import UUID
    s = grading_setup

    items = [{
        "learning_object_id": s["mcq_lo"].id,
        "item_version_id": s["mcq_iv"].id,
        "question_type": "MULTIPLE_CHOICE",
        "options": [
            {"text": "3", "is_correct": False},
            {"text": "4", "is_correct": True},
        ],
    }]
    session_id = await _create_submitted_session(
        s["mcq_test"].id, s["student"].id, items,
        [{"lo_id": s["mcq_lo"].id, "payload": {"selected_option_index": 0}}],
    )

    result = await auto_grade_session(UUID(session_id))
    assert result["total_points"] == 0.0
    assert result["grading_status"] == "AUTO_GRADED"

    grade = await prisma.question_grades.find_first(where={"session_id": session_id})
    assert grade.points_awarded == 0.0
    assert grade.is_correct is False

    sr = await prisma.session_results.find_unique(where={"session_id": session_id})
    assert sr.letter_grade == "Fail"
    assert sr.passed is False


@pytest.mark.anyio
async def test_auto_grade_mixed_session_partial(grading_setup):
    """Session with MCQ + essay gets PARTIALLY_GRADED, essay is pending."""
    from app.services.grading_service import auto_grade_session
    from uuid import UUID
    s = grading_setup

    items = [
        {
            "learning_object_id": s["mcq_lo"].id,
            "item_version_id": s["mcq_iv"].id,
            "question_type": "MULTIPLE_CHOICE",
            "options": [{"text": "4", "is_correct": True}],
        },
        {
            "learning_object_id": s["essay_lo"].id,
            "item_version_id": s["essay_iv"].id,
            "question_type": "ESSAY",
        },
    ]
    session_id = await _create_submitted_session(
        s["mixed_test"].id, s["student"].id, items,
        [
            {"lo_id": s["mcq_lo"].id, "payload": {"selected_option_index": 0}},
            {"lo_id": s["essay_lo"].id, "payload": {"essay_text": "Recursion is..."}},
        ],
    )

    result = await auto_grade_session(UUID(session_id))
    assert result["graded"] == 1
    assert result["pending_manual"] == 1
    assert result["grading_status"] == "PARTIALLY_GRADED"

    grades = await prisma.question_grades.find_many(where={"session_id": session_id})
    assert len(grades) == 2

    essay_grade = next(g for g in grades if not g.is_auto_graded)
    assert essay_grade.points_awarded == 0.0
    assert essay_grade.is_correct is None

    sr = await prisma.session_results.find_unique(where={"session_id": session_id})
    assert sr.grading_status == "PARTIALLY_GRADED"


@pytest.mark.anyio
async def test_auto_grade_idempotent(grading_setup):
    """Calling auto_grade_session twice does not duplicate question_grades."""
    from app.services.grading_service import auto_grade_session
    from uuid import UUID
    s = grading_setup

    items = [{
        "learning_object_id": s["mcq_lo"].id,
        "item_version_id": s["mcq_iv"].id,
        "question_type": "MULTIPLE_CHOICE",
        "options": [{"text": "4", "is_correct": True}],
    }]
    session_id = await _create_submitted_session(
        s["mcq_test"].id, s["student"].id, items,
        [{"lo_id": s["mcq_lo"].id, "payload": {"selected_option_index": 0}}],
    )

    await auto_grade_session(UUID(session_id))
    await auto_grade_session(UUID(session_id))  # second call

    grades = await prisma.question_grades.find_many(where={"session_id": session_id})
    assert len(grades) == 1  # skip_duplicates prevents doubling

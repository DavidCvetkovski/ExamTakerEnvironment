"""
Student-facing result views.

Read-only access to a student's *own* published exam results — the "My Grades"
tab and the per-question detail breakdown. Split out of ``results_service``
(Epoch 15, #28): that module owns the instructor grading workflow
(overview, queue, manual grade, publication, CSV export); this one owns the
student read path. Keeping them apart makes the authorization boundary obvious
— every function here scopes strictly to ``student_id`` and refuses to leak
unpublished work.
"""
from typing import Any, Dict, List

from fastapi import HTTPException, status

from app.core.prisma_db import prisma


from app.core.json_utils import parse_json


async def get_student_published_results(
    student_id: str,
    include_unpublished: bool = False,
) -> List[Dict[str, Any]]:
    """
    Return results for a specific student.

    By default returns only published results. When ``include_unpublished`` is true,
    submitted-but-unpublished session results are also included so the student-facing
    "My Grades" tab can surface a pending-grading section.
    """
    where: Dict[str, Any] = {"student_id": student_id}
    if not include_unpublished:
        where["is_published"] = True

    results = await prisma.session_results.find_many(
        where=where,
        include={"test_definitions": True, "exam_sessions": True},
        order={"created_at": "desc"},
    )
    return [
        {
            "session_id": r.session_id,
            "test_definition_id": r.test_definition_id,
            "test_title": r.test_definitions.title if r.test_definitions else None,
            "total_points": r.total_points,
            "max_points": r.max_points,
            "percentage": r.percentage,
            "letter_grade": r.letter_grade,
            "passed": r.passed,
            "grading_status": r.grading_status,
            "is_published": r.is_published,
            "details_visible": r.details_visible,
            "published_at": r.published_at,
            "submitted_at": getattr(r.exam_sessions, "submitted_at", None) if getattr(r, "exam_sessions", None) else None,
        }
        for r in results
    ]


async def get_student_result_detail(
    session_id: str, student_id: str
) -> Dict[str, Any]:
    """
    Return a detailed per-question result for a student's exam session.
    Only available if the result is published.

    Raises:
        403 if not published or not owned by student.
        404 if result not found.
    """
    result = await prisma.session_results.find_unique(
        where={"session_id": session_id},
        include={"test_definitions": True},
    )
    if not result:
        raise HTTPException(status_code=404, detail="Result not found.")

    if result.student_id != student_id:
        raise HTTPException(status_code=403, detail="Not authorized.")

    if not result.is_published:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Results are not yet published.",
        )

    if not result.details_visible:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The instructor released grades only for this exam.",
        )

    session = await prisma.exam_sessions.find_unique(where={"id": session_id})
    grades = await prisma.question_grades.find_many(
        where={"session_id": session_id},
        order={"created_at": "asc"},
    )

    # Build frozen item lookup for question content
    items_raw = parse_json(session.items) if session else []
    items_by_lo: Dict[str, Any] = {
        str(item.get("learning_object_id")): item for item in items_raw
    }

    question_details = []
    for grade in grades:
        lo_id = str(grade.learning_object_id or "")
        item = items_by_lo.get(lo_id, {})
        question_details.append({
            "grade_id": grade.id,
            "learning_object_id": lo_id,
            "item_version_id": str(grade.item_version_id or ""),
            "question_type": item.get("question_type"),
            "question_content": item.get("content"),
            "question_options": parse_json(item.get("options")),
            "student_answer": parse_json(grade.student_answer),
            "correct_answer": parse_json(grade.correct_answer),
            "points_awarded": grade.points_awarded,
            "points_possible": grade.points_possible,
            "is_correct": grade.is_correct,
            "is_auto_graded": grade.is_auto_graded,
            "feedback": grade.feedback,
        })

    return {
        "session_id": session_id,
        "test_title": result.test_definitions.title if result.test_definitions else None,
        "submitted_at": session.submitted_at if session else None,
        "total_points": result.total_points,
        "max_points": result.max_points,
        "percentage": result.percentage,
        "letter_grade": result.letter_grade,
        "passed": result.passed,
        "grading_status": result.grading_status,
        "question_results": question_details,
    }

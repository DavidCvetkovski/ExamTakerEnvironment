"""Osiris-compatible grade export: stream published results as CSV.

Exports are always bounded — at least a course or a scheduled session must be
named, never an unfiltered dump (directive §8.4, CLAUDE.md §4 pagination). Only
grades are exported; student responses never leave through this path.
"""

import csv
import io
from typing import AsyncIterator, Optional

from fastapi import HTTPException, status

from app.core.prisma_db import prisma
from app.services import integration_audit_service

# Header kept stable for the institutional target; `student_name` is retained for
# format compatibility even though the user record stores no display name today.
_COLUMNS = [
    "course_code",
    "test_title",
    "scheduled_session_id",
    "vunet_id",
    "email",
    "student_name",
    "score",
    "max_score",
    "percentage",
    "passed",
    "letter_grade",
    "submitted_at",
    "graded_at",
]


def _iso(value) -> str:
    """Render a datetime as ISO-8601, or empty string when absent."""
    return value.isoformat() if value else ""


async def _fetch_results(
    *,
    course_id: Optional[str],
    scheduled_session_id: Optional[str],
    test_definition_id: Optional[str],
    published_only: bool,
):
    """Build the bounded result query with its required relations."""
    where: dict = {}
    if published_only:
        where["is_published"] = True
    if test_definition_id:
        where["test_definition_id"] = test_definition_id
    if course_id:
        where["test_definitions"] = {"is": {"course_id": course_id}}
    if scheduled_session_id:
        where["exam_sessions"] = {"is": {"scheduled_session_id": scheduled_session_id}}

    return await prisma.session_results.find_many(
        where=where,
        include={
            "students": True,
            "exam_sessions": True,
            "test_definitions": {"include": {"courses": True}},
        },
        order={"created_at": "asc"},
    )


def _row_for(result) -> list:
    """Project a single result row into the export column order."""
    test = result.test_definitions
    course = test.courses if test else None
    student = result.students
    session = result.exam_sessions
    return [
        course.code if course else "",
        test.title if test else "",
        session.scheduled_session_id if session and session.scheduled_session_id else "",
        student.vunet_id if student and student.vunet_id else "",
        student.email if student else "",
        "",  # student_name: no display name stored on the user record
        result.total_points,
        result.max_points,
        round(result.percentage, 2),
        "" if result.passed is None else result.passed,
        result.letter_grade or "",
        _iso(session.submitted_at if session else None),
        _iso(result.published_at),
    ]


async def export_grades_csv(
    *,
    course_id: Optional[str],
    scheduled_session_id: Optional[str],
    test_definition_id: Optional[str],
    published_only: bool,
    actor_id: str,
) -> AsyncIterator[str]:
    """Yield Osiris-compatible CSV lines for the filtered result set.

    Requires at least a course or scheduled-session filter; audits the export
    with the filter set and row count (never the grades themselves).
    """
    if not course_id and not scheduled_session_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least a course_id or scheduled_session_id filter.",
        )

    results = await _fetch_results(
        course_id=course_id,
        scheduled_session_id=scheduled_session_id,
        test_definition_id=test_definition_id,
        published_only=published_only,
    )

    await integration_audit_service.record_integration_audit(
        integration="sis",
        action="grade_export",
        status="success",
        actor_user_id=actor_id,
        resource_type="course" if course_id else "scheduled_session",
        resource_id=course_id or scheduled_session_id,
        metadata={
            "row_count": len(results),
            "published_only": published_only,
            "test_definition_id": test_definition_id,
        },
    )

    def _line(values: list) -> str:
        buffer = io.StringIO()
        csv.writer(buffer).writerow(values)
        return buffer.getvalue()

    yield _line(_COLUMNS)
    for result in results:
        yield _line(_row_for(result))

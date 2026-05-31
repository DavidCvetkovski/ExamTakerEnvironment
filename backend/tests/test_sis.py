"""Tests for SIS / Osiris roster + accommodation import and grade export."""

import uuid
from datetime import datetime, timezone

import pytest
from prisma import Json

from app.core.prisma_db import prisma
from tests.conftest import auth_headers_for_role, make_user


def _csv(rows: list[str]) -> bytes:
    return ("\n".join(rows) + "\n").encode("utf-8")


async def _course(code="SIS101"):
    return await prisma.courses.create(
        data={"code": f"{code}-{uuid.uuid4().hex[:6]}", "title": "SIS course"}
    )


# --- roster import -------------------------------------------------------

@pytest.mark.asyncio
async def test_roster_import_enrolls_student(client, admin_token):
    headers, _ = admin_token
    course = await _course()
    vid = f"net{uuid.uuid4().hex[:6]}"
    csv = _csv([
        "course_code,vunet_id,email,first_name,last_name,role,is_active",
        f"{course.code},{vid},stu@vu.nl,Sam,Student,student,true",
    ])
    resp = await client.post(
        "/api/sis/rosters/import",
        headers=headers,
        files={"file": ("roster.csv", csv, "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success_rows"] == 1 and body["error_rows"] == 0
    user = await prisma.users.find_unique(where={"vunet_id": vid})
    assert user is not None
    enrollment = await prisma.course_enrollments.find_first(
        where={"course_id": course.id, "student_id": user.id}
    )
    assert enrollment is not None and enrollment.is_active is True


@pytest.mark.asyncio
async def test_roster_import_reports_unknown_course(client, admin_token):
    headers, _ = admin_token
    csv = _csv([
        "course_code,vunet_id,email,first_name,last_name,role,is_active",
        "NOPE999,net123,stu@vu.nl,Sam,Student,student,true",
    ])
    resp = await client.post(
        "/api/sis/rosters/import",
        headers=headers,
        files={"file": ("roster.csv", csv, "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["error_rows"] == 1
    assert "Unknown course_code" in body["rows"][0]["message"]


@pytest.mark.asyncio
async def test_roster_import_forbidden_for_student(client, student_token):
    headers, _ = student_token
    csv = _csv(["course_code,vunet_id,email,first_name,last_name,role,is_active"])
    resp = await client.post(
        "/api/sis/rosters/import",
        headers=headers,
        files={"file": ("roster.csv", csv, "text/csv")},
    )
    assert resp.status_code == 403


# --- accommodation import ------------------------------------------------

@pytest.mark.asyncio
async def test_accommodation_import_applies_multiplier(client, admin_token):
    headers, _ = admin_token
    student = await make_user("STUDENT", vunet_id=f"acc{uuid.uuid4().hex[:6]}")
    csv = _csv([
        "vunet_id,provision_time_multiplier,enlarged_display",
        f"{student.vunet_id},1.5,true",
    ])
    resp = await client.post(
        "/api/sis/accommodations/import",
        headers=headers,
        files={"file": ("acc.csv", csv, "text/csv")},
    )
    assert resp.status_code == 200
    assert resp.json()["success_rows"] == 1
    refreshed = await prisma.users.find_unique(where={"id": student.id})
    assert refreshed.provision_time_multiplier == 1.5


@pytest.mark.asyncio
async def test_accommodation_import_rejects_non_student(client, admin_token):
    headers, _ = admin_token
    constructor = await make_user("CONSTRUCTOR", vunet_id=f"con{uuid.uuid4().hex[:6]}")
    csv = _csv([
        "vunet_id,provision_time_multiplier,enlarged_display",
        f"{constructor.vunet_id},1.5,true",
    ])
    resp = await client.post(
        "/api/sis/accommodations/import",
        headers=headers,
        files={"file": ("acc.csv", csv, "text/csv")},
    )
    assert resp.status_code == 200
    assert resp.json()["error_rows"] == 1


# --- grade export --------------------------------------------------------

async def _published_result(course):
    test = await prisma.test_definitions.create(
        data={"title": "Final", "blocks": Json([]), "duration_minutes": 60, "course_id": course.id}
    )
    student = await make_user("STUDENT", vunet_id=f"grd{uuid.uuid4().hex[:6]}")
    session = await prisma.exam_sessions.create(
        data={
            "student_id": student.id,
            "test_definition_id": test.id,
            "status": "SUBMITTED",
            "submitted_at": datetime.now(timezone.utc),
        }
    )
    await prisma.session_results.create(
        data={
            "session_id": session.id,
            "test_definition_id": test.id,
            "student_id": student.id,
            "total_points": 8.0,
            "max_points": 10.0,
            "percentage": 80.0,
            "grading_status": "FULLY_GRADED",
            "questions_graded": 1,
            "questions_total": 1,
            "passed": True,
            "letter_grade": "B",
            "is_published": True,
            "published_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        }
    )
    return student


@pytest.mark.asyncio
async def test_grade_export_returns_csv(client, admin_token):
    headers, _ = admin_token
    course = await _course()
    student = await _published_result(course)
    resp = await client.get(
        f"/api/sis/grades/export?course_id={course.id}", headers=headers
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    text = resp.text
    assert "course_code,test_title" in text
    assert student.vunet_id in text
    assert "80.0" in text


@pytest.mark.asyncio
async def test_grade_export_requires_filter(client, admin_token):
    headers, _ = admin_token
    resp = await client.get("/api/sis/grades/export", headers=headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_grade_export_forbidden_for_student(client, student_token):
    headers, _ = student_token
    resp = await client.get(
        f"/api/sis/grades/export?course_id={uuid.uuid4()}", headers=headers
    )
    assert resp.status_code == 403

"""Tests for SIS / Osiris roster + accommodation import and grade export."""

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from prisma import Json

from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole


@pytest.fixture(autouse=True)
async def use_cleanup(cleanup_database):
    pass


async def _make_user(email, role, password="pass1234", vunet_id=None):
    return await prisma.users.create(
        data={"email": email, "hashed_password": hash_password(password),
              "role": role.value, "is_active": True, "vunet_id": vunet_id}
    )


async def _login(ac, email, password="pass1234"):
    resp = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _csv(rows: list[str]) -> bytes:
    return ("\n".join(rows) + "\n").encode("utf-8")


async def _course(code="SIS101"):
    return await prisma.courses.create(
        data={"code": f"{code}-{uuid.uuid4().hex[:6]}", "title": "SIS course"}
    )


# --- roster import -------------------------------------------------------

@pytest.mark.anyio
async def test_roster_import_enrolls_student(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")
    course = await _course()
    vid = f"net{uuid.uuid4().hex[:6]}"
    csv = _csv([
        "course_code,vunet_id,email,first_name,last_name,role,is_active",
        f"{course.code},{vid},stu@vu.nl,Sam,Student,student,true",
    ])
    resp = await ac.post(
        "/api/sis/rosters/import", headers=_auth(token),
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


@pytest.mark.anyio
async def test_roster_import_reports_unknown_course(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")
    csv = _csv([
        "course_code,vunet_id,email,first_name,last_name,role,is_active",
        "NOPE999,net123,stu@vu.nl,Sam,Student,student,true",
    ])
    resp = await ac.post(
        "/api/sis/rosters/import", headers=_auth(token),
        files={"file": ("roster.csv", csv, "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["error_rows"] == 1
    assert "Unknown course_code" in body["rows"][0]["message"]


@pytest.mark.anyio
async def test_roster_import_forbidden_for_student(ac: AsyncClient):
    await _make_user("stu@vu.nl", UserRole.STUDENT)
    token = await _login(ac, "stu@vu.nl")
    csv = _csv(["course_code,vunet_id,email,first_name,last_name,role,is_active"])
    resp = await ac.post(
        "/api/sis/rosters/import", headers=_auth(token),
        files={"file": ("roster.csv", csv, "text/csv")},
    )
    assert resp.status_code == 403


# --- accommodation import ------------------------------------------------

@pytest.mark.anyio
async def test_accommodation_import_applies_multiplier(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")
    student = await _make_user("s2@vu.nl", UserRole.STUDENT, vunet_id=f"acc{uuid.uuid4().hex[:6]}")
    csv = _csv([
        "vunet_id,provision_time_multiplier,enlarged_display",
        f"{student.vunet_id},1.5,true",
    ])
    resp = await ac.post(
        "/api/sis/accommodations/import", headers=_auth(token),
        files={"file": ("acc.csv", csv, "text/csv")},
    )
    assert resp.status_code == 200
    assert resp.json()["success_rows"] == 1
    refreshed = await prisma.users.find_unique(where={"id": student.id})
    assert refreshed.provision_time_multiplier == 1.5


@pytest.mark.anyio
async def test_accommodation_import_rejects_non_student(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")
    con = await _make_user("c2@vu.nl", UserRole.CONSTRUCTOR, vunet_id=f"con{uuid.uuid4().hex[:6]}")
    csv = _csv([
        "vunet_id,provision_time_multiplier,enlarged_display",
        f"{con.vunet_id},1.5,true",
    ])
    resp = await ac.post(
        "/api/sis/accommodations/import", headers=_auth(token),
        files={"file": ("acc.csv", csv, "text/csv")},
    )
    assert resp.status_code == 200
    assert resp.json()["error_rows"] == 1


# --- grade export --------------------------------------------------------

async def _published_result(course):
    test = await prisma.test_definitions.create(
        data={"title": "Final", "blocks": Json([]), "duration_minutes": 60, "course_id": course.id}
    )
    student = await _make_user(
        f"grd{uuid.uuid4().hex[:6]}@vu.nl", UserRole.STUDENT, vunet_id=f"grd{uuid.uuid4().hex[:6]}"
    )
    session = await prisma.exam_sessions.create(
        data={
            "student_id": student.id, "test_definition_id": test.id,
            "items": Json([]), "status": "SUBMITTED",
            "started_at": datetime.now(timezone.utc), "expires_at": datetime.now(timezone.utc),
            "submitted_at": datetime.now(timezone.utc),
        }
    )
    await prisma.session_results.create(
        data={
            "session_id": session.id, "test_definition_id": test.id, "student_id": student.id,
            "total_points": 8.0, "max_points": 10.0, "percentage": 80.0,
            "grading_status": "FULLY_GRADED", "questions_graded": 1, "questions_total": 1,
            "passed": True, "letter_grade": "B", "is_published": True,
            "published_at": datetime.now(timezone.utc), "created_at": datetime.now(timezone.utc),
        }
    )
    return student


@pytest.mark.anyio
async def test_grade_export_returns_csv(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")
    course = await _course()
    student = await _published_result(course)
    resp = await ac.get(f"/api/sis/grades/export?course_id={course.id}", headers=_auth(token))
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    text = resp.text
    assert "course_code,test_title" in text
    assert student.vunet_id in text
    assert "80.0" in text


@pytest.mark.anyio
async def test_grade_export_requires_filter(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")
    resp = await ac.get("/api/sis/grades/export", headers=_auth(token))
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_grade_export_forbidden_for_student(ac: AsyncClient):
    await _make_user("stu@vu.nl", UserRole.STUDENT)
    token = await _login(ac, "stu@vu.nl")
    resp = await ac.get(f"/api/sis/grades/export?course_id={uuid.uuid4()}", headers=_auth(token))
    assert resp.status_code == 403

"""Roster CSV import: provision/match users and upsert course enrollments.

Header: ``course_code,vunet_id,email,first_name,last_name,role,is_active``.
Users are matched by VUnetID first, then email. Deactivation only deactivates
the enrollment, never the whole account (CLAUDE.md §1 least privilege / safety).
"""

import re
import secrets

from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.schemas.sis import SisImportJobResult, SisImportRowResult
from app.services.sis.job_recorder import RowError, parse_bool, parse_csv, record_job

_REQUIRED = {"course_code", "vunet_id", "email", "first_name", "last_name", "role", "is_active"}
_ROLE_MAP = {"student": "STUDENT", "constructor": "CONSTRUCTOR"}
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


async def import_roster(
    content: bytes, filename: str, actor_id: str, *, create_missing_courses: bool
) -> SisImportJobResult:
    """Validate and apply a roster CSV, returning a row-level job report."""
    rows = parse_csv(content, _REQUIRED)
    results = []
    for i, raw in enumerate(rows, start=1):
        try:
            await _apply_row(raw, create_missing_courses=create_missing_courses)
            results.append((i, SisImportRowResult(row_number=i, status="OK"), raw))
        except RowError as exc:
            results.append((i, SisImportRowResult(row_number=i, status="ERROR", message=str(exc)), raw))
    return await record_job(
        import_type="roster", filename=filename, actor_id=actor_id, results=results
    )


async def _resolve_course(course_code: str, *, create_missing_courses: bool):
    course = await prisma.courses.find_unique(where={"code": course_code})
    if course:
        return course
    if not create_missing_courses:
        raise RowError(f"Unknown course_code {course_code}")
    return await prisma.courses.create(data={"code": course_code, "title": course_code})


async def _resolve_or_create_user(vunet_id: str, email: str, role: str):
    """Match by VUnetID, then email; otherwise provision a new account."""
    user = await prisma.users.find_unique(where={"vunet_id": vunet_id})
    if not user:
        user = await prisma.users.find_unique(where={"email": email})
    if user:
        return user
    return await prisma.users.create(
        data={
            "email": email,
            "vunet_id": vunet_id,
            "hashed_password": hash_password(secrets.token_urlsafe(32)),
            "role": role,
            "is_active": True,
        }
    )


async def _apply_row(raw: dict, *, create_missing_courses: bool) -> None:
    course_code = raw["course_code"]
    vunet_id = raw["vunet_id"]
    email = raw["email"].lower()
    role = _ROLE_MAP.get(raw["role"].lower())

    if not course_code:
        raise RowError("course_code is required")
    if not vunet_id:
        raise RowError("vunet_id is required")
    if not _EMAIL_RE.match(email):
        raise RowError(f"Invalid email {raw['email']!r}")
    if role is None:
        raise RowError(f"Invalid role {raw['role']!r} (allowed: student, constructor)")

    is_active = parse_bool(raw.get("is_active", ""), default=True)
    course = await _resolve_course(course_code, create_missing_courses=create_missing_courses)
    user = await _resolve_or_create_user(vunet_id, email, role)

    # Only students are enrolled; constructors are simply ensured to exist.
    if role == "STUDENT":
        await prisma.course_enrollments.upsert(
            where={"course_id_student_id": {"course_id": str(course.id), "student_id": str(user.id)}},
            data={
                "create": {"course_id": str(course.id), "student_id": str(user.id), "is_active": is_active},
                "update": {"is_active": is_active},
            },
        )

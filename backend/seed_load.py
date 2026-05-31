"""Deterministic seed for Epoch 13 load testing (directive §13.2).

Creates a self-contained, repeatable data set the k6 scenarios in
``load-tests/k6/`` can drive:

- 1 admin, 1 constructor (synthetic @loadtest.local accounts)
- 1 course (code ``LOAD101``)
- 1 item bank with a mix of objective + essay items (APPROVED)
- 1 test definition whose blocks FIX-reference those items
- 1 scheduled exam session active *now*
- ``STUDENT_COUNT`` students with known credentials, all enrolled

Everything is namespaced to the ``loadtest.local`` email domain and the
``LOAD101`` course code so it never collides with real data, and the script is
idempotent: re-running it reuses existing rows instead of duplicating them.

Run from the ``backend/`` directory::

    STUDENT_COUNT=500 PYTHONPATH=. python seed_load.py

On success it prints a JSON manifest (also written to
``load-tests/seed-manifest.json``) containing the values the k6 scripts need:
``SCHEDULED_SESSION_ID``, ``STUDENT_COUNT``, ``STUDENT_PASSWORD``.

This script must never be run against a production database.
"""
import asyncio
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from prisma import Json

from app.core.config import settings
from app.core.prisma_db import connect_prisma, disconnect_prisma, prisma
from app.core.security import hash_password

STUDENT_COUNT = int(os.environ.get("STUDENT_COUNT", "500"))
STUDENT_PASSWORD = os.environ.get("STUDENT_PASSWORD", "loadtest-pass-123")
COURSE_CODE = "LOAD101"
DOMAIN = "loadtest.local"
NUM_ITEMS = 10  # objective + essay mix referenced by the blueprint

_TIPTAP_DOC = {
    "type": "doc",
    "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Load-test item."}]}],
}


async def _upsert_user(email: str, role: str, password: str) -> str:
    """Create the user if absent (idempotent on the unique email); return id."""
    existing = await prisma.users.find_unique(where={"email": email})
    if existing:
        return existing.id
    created = await prisma.users.create(
        data={
            "email": email,
            "hashed_password": hash_password(password),
            "role": role,
            "is_active": True,
            "provision_time_multiplier": 1.0,
        }
    )
    return created.id


async def _get_or_create_course(created_by: str) -> str:
    existing = await prisma.courses.find_unique(where={"code": COURSE_CODE})
    if existing:
        return existing.id
    created = await prisma.courses.create(
        data={"code": COURSE_CODE, "title": "Load Test Course", "created_by": created_by}
    )
    return created.id


async def _get_or_create_items(bank_id: str, course_id: str, created_by: str) -> list[str]:
    """Return learning-object ids, creating APPROVED versions if needed."""
    existing = await prisma.learning_objects.find_many(
        where={"bank_id": bank_id}, order={"created_at": "asc"}
    )
    if len(existing) >= NUM_ITEMS:
        return [lo.id for lo in existing[:NUM_ITEMS]]

    lo_ids: list[str] = [lo.id for lo in existing]
    for i in range(len(existing), NUM_ITEMS):
        is_essay = i % 3 == 0
        lo = await prisma.learning_objects.create(
            data={"bank_id": bank_id, "course_id": course_id, "created_by": created_by}
        )
        if is_essay:
            question_type = "ESSAY"
            options = {}
        else:
            question_type = "MULTIPLE_CHOICE"
            options = {"choices": ["A", "B", "C", "D"], "correct": [i % 4]}
        await prisma.item_versions.create(
            data={
                "learning_object_id": lo.id,
                "version_number": 1,
                "status": "APPROVED",
                "question_type": question_type,
                "content": Json(_TIPTAP_DOC),
                "options": Json(options),
                "metadata_tags": Json({"loadtest": True}),
                "created_by": created_by,
            }
        )
        lo_ids.append(lo.id)
    return lo_ids


async def _get_or_create_test_definition(course_id: str, created_by: str, lo_ids: list[str]) -> str:
    title = "Load Test Exam"
    existing = await prisma.test_definitions.find_first(
        where={"course_id": course_id, "title": title}
    )
    if existing:
        return existing.id
    blocks = [
        {
            "title": "Section 1",
            "rules": [{"rule_type": "FIXED", "learning_object_id": lo_id} for lo_id in lo_ids],
        }
    ]
    created = await prisma.test_definitions.create(
        data={
            "title": title,
            "description": "Auto-generated for load testing.",
            "course_id": course_id,
            "created_by": created_by,
            "blocks": Json(blocks),
            "duration_minutes": 120,
            "shuffle_questions": False,
            "scoring_config": Json({}),
        }
    )
    return created.id


async def _get_or_create_scheduled_session(course_id: str, test_def_id: str, created_by: str) -> str:
    existing = await prisma.scheduled_exam_sessions.find_first(
        where={"course_id": course_id, "test_definition_id": test_def_id}
    )
    now = datetime.now(timezone.utc)
    window = {"starts_at": now - timedelta(minutes=5), "ends_at": now + timedelta(hours=4)}
    if existing:
        # Refresh the window so the exam is active whenever the seed is re-run.
        await prisma.scheduled_exam_sessions.update(
            where={"id": existing.id},
            data={**window, "status": "SCHEDULED"},
        )
        return existing.id
    created = await prisma.scheduled_exam_sessions.create(
        data={
            "course_id": course_id,
            "test_definition_id": test_def_id,
            "created_by": created_by,
            "status": "SCHEDULED",
            **window,
        }
    )
    return created.id


async def _enroll_students(course_id: str) -> int:
    """Create students + enrollments idempotently. Returns student count."""
    for i in range(1, STUDENT_COUNT + 1):
        email = f"load_student_{i}@{DOMAIN}"
        student_id = await _upsert_user(email, "STUDENT", STUDENT_PASSWORD)
        enrollment = await prisma.course_enrollments.find_first(
            where={"course_id": course_id, "student_id": student_id}
        )
        if not enrollment:
            await prisma.course_enrollments.create(
                data={"course_id": course_id, "student_id": student_id, "is_active": True}
            )
    return STUDENT_COUNT


async def main() -> None:
    if settings.ENVIRONMENT == "production":
        raise SystemExit("Refusing to seed load-test data in production.")

    await connect_prisma()
    try:
        admin_id = await _upsert_user(f"load_admin@{DOMAIN}", "ADMIN", STUDENT_PASSWORD)
        await _upsert_user(f"load_constructor@{DOMAIN}", "CONSTRUCTOR", STUDENT_PASSWORD)

        course_id = await _get_or_create_course(admin_id)

        bank = await prisma.item_banks.find_first(where={"name": "Load Test Bank"})
        if not bank:
            bank = await prisma.item_banks.create(
                data={"name": "Load Test Bank", "created_by": admin_id}
            )
        lo_ids = await _get_or_create_items(bank.id, course_id, admin_id)
        test_def_id = await _get_or_create_test_definition(course_id, admin_id, lo_ids)
        scheduled_id = await _get_or_create_scheduled_session(course_id, test_def_id, admin_id)
        count = await _enroll_students(course_id)

        manifest = {
            "SCHEDULED_SESSION_ID": scheduled_id,
            "STUDENT_COUNT": count,
            "STUDENT_PASSWORD": STUDENT_PASSWORD,
            "COURSE_CODE": COURSE_CODE,
            "TEST_DEFINITION_ID": test_def_id,
        }
        out_path = Path(__file__).resolve().parent.parent / "load-tests" / "seed-manifest.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(manifest, indent=2))
        print(json.dumps(manifest, indent=2))
        print(f"\nManifest written to {out_path}")
    finally:
        await disconnect_prisma()


if __name__ == "__main__":
    asyncio.run(main())

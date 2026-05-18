"""Regression tests: PRACTICE-mode submissions stay out of Combined views.

Epoch 8.6.1 changed the meaning of "Combined": it now excludes
``session_mode='PRACTICE'`` submissions so that author previews don't
pollute grading queues or psychometric reliability metrics. The single
point of truth for that rule is the ``is_combined`` branch of
:mod:`app.services.run_filter`. These tests anchor that contract at the
*endpoint* level so a future query refactor can't silently re-include
practice without lighting up red here.

Each test creates: one CLOSED scheduled run with N assigned submissions,
plus M practice submissions on the same blueprint. The expectations
below assert the Combined view sees N, not N+M.
"""
from datetime import datetime, timedelta, timezone

import pytest
import prisma as prisma_lib
from httpx import AsyncClient

from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole


pytestmark = pytest.mark.anyio

ADMIN_EMAIL = "practice_excl_admin@vu.nl"
STUDENT_EMAIL = "practice_excl_student@vu.nl"
PASS = "pass"

# Counts the assertions below check against; if you change one, change both.
N_ASSIGNED = 3
M_PRACTICE = 2


@pytest.fixture(scope="function")
async def practice_mix_setup(cleanup_database):
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
    course = await prisma.courses.create(data={
        "code": "MIX-101", "title": "Mix Course", "created_by": admin.id,
    })

    test_def = await prisma.test_definitions.create(data={
        "title": "Mix Test",
        "created_by": admin.id,
        "blocks": prisma_lib.Json([{"title": "S1", "rules": []}]),
        "duration_minutes": 60,
    })

    now = datetime.now(timezone.utc)
    run = await prisma.scheduled_exam_sessions.create(data={
        "test_definition_id": test_def.id,
        "course_id": course.id,
        "starts_at": now - timedelta(hours=2),
        "ends_at": now - timedelta(hours=1),
        "status": "CLOSED",
        "created_by": admin.id,
    })

    # N ASSIGNED submissions tied to the run
    for _ in range(N_ASSIGNED):
        await prisma.exam_sessions.create(data={
            "test_definition_id": test_def.id,
            "student_id": student.id,
            "scheduled_session_id": run.id,
            "session_mode": "ASSIGNED",
            "status": "SUBMITTED",
            "items": prisma_lib.Json([]),
            "started_at": now - timedelta(hours=2),
            "submitted_at": now - timedelta(hours=1, minutes=5),
            "expires_at": now - timedelta(hours=1),
        })

    # M PRACTICE submissions (no scheduled_session_id, mode=PRACTICE)
    for _ in range(M_PRACTICE):
        await prisma.exam_sessions.create(data={
            "test_definition_id": test_def.id,
            "student_id": student.id,
            "scheduled_session_id": None,
            "session_mode": "PRACTICE",
            "status": "SUBMITTED",
            "items": prisma_lib.Json([]),
            "started_at": now - timedelta(hours=3),
            "submitted_at": now - timedelta(hours=2, minutes=30),
            "expires_at": now - timedelta(hours=2),
        })

    return {"test_def": test_def, "run": run, "admin": admin, "student": student}


async def _login(ac: AsyncClient, email: str) -> dict:
    resp = await ac.post("/api/auth/login", json={"email": email, "password": PASS})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ─────────────────────────────────────────────
# Grading: Combined excludes practice
# ─────────────────────────────────────────────

async def test_grading_overview_combined_excludes_practice(ac, practice_mix_setup):
    """GET grading-overview (no run_id) returns N ASSIGNED submissions,
    not N+M. This is the most direct regression test for the 8.6.1 fix."""
    s = practice_mix_setup
    headers = await _login(ac, ADMIN_EMAIL)
    resp = await ac.get(
        f"/api/grading/tests/{s['test_def'].id}/grading-overview", headers=headers,
    )
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == N_ASSIGNED, (
        f"Combined grading view leaked practice submissions: got {len(rows)}, "
        f"expected {N_ASSIGNED}. Either run_filter.is_combined no longer "
        f"filters session_mode='ASSIGNED', or this endpoint stopped using it."
    )
    assert all(r["session_mode"] == "ASSIGNED" for r in rows)


async def test_grading_runs_picker_omits_practice_bucket(ac, practice_mix_setup):
    """No row with ``kind='PRACTICE'`` may appear in the picker, regardless
    of how many practice submissions exist."""
    s = practice_mix_setup
    headers = await _login(ac, ADMIN_EMAIL)
    resp = await ac.get(f"/api/grading/tests/{s['test_def'].id}/runs", headers=headers)
    assert resp.status_code == 200
    runs = resp.json()
    assert all(r["kind"] != "PRACTICE" for r in runs)


# ─────────────────────────────────────────────
# Analytics: Combined card count + picker shape
# ─────────────────────────────────────────────

async def test_analytics_runs_picker_omits_practice_bucket(ac, practice_mix_setup):
    s = practice_mix_setup
    headers = await _login(ac, ADMIN_EMAIL)
    resp = await ac.get(f"/api/analytics/tests/{s['test_def'].id}/runs", headers=headers)
    assert resp.status_code == 200
    runs = resp.json()
    assert all(r["kind"] != "PRACTICE" for r in runs)


async def test_analytics_runs_combined_card_count_excludes_practice(ac, practice_mix_setup):
    """The Combined sentinel row's ``submissions_total`` must equal the
    ASSIGNED count, not the total. This is what the picker UI shows next
    to the 'Recommended' badge — if it inflates, the user-facing claim
    that 'Combined pools every published submission across runs' becomes
    a lie because it would include author previews too.
    """
    s = practice_mix_setup
    headers = await _login(ac, ADMIN_EMAIL)
    resp = await ac.get(f"/api/analytics/tests/{s['test_def'].id}/runs", headers=headers)
    runs = resp.json()
    combined = next((r for r in runs if r["kind"] == "COMBINED"), None)
    assert combined is not None, "Analytics picker should always return a Combined row"
    assert combined["submissions_total"] == N_ASSIGNED, (
        f"Combined count includes practice: got {combined['submissions_total']}, "
        f"expected {N_ASSIGNED} (practice count was {M_PRACTICE})."
    )

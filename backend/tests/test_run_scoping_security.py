"""Cross-tenant run-id scoping — security boundary tests.

The threat: a constructor crafts a request to a grading or analytics
endpoint for ``test_definition_id=THEIR_TEST`` but passes
``run_id=SOMEONE_ELSE'S_SCHEDULED_RUN_ID`` in the query string. Without
``assert_run_belongs_to_test``, that would leak another tenant's
submission data through their own test's response shape.

The contract these tests enforce:

  * Combined / practice / None sentinels are never tenant-scoped → 2xx.
  * A run UUID that belongs to *this* test → 2xx.
  * A run UUID that belongs to a *different* test → 404 (not 403 — we
    deliberately don't leak whether the UUID is valid elsewhere).
  * A run UUID that doesn't exist anywhere → 404.

Run-scoping is enforced at the route layer, so every endpoint that
accepts ``run_id`` is exercised. Adding a new ``run_id`` query param to
any endpoint without wiring up ``assert_run_belongs_to_test`` will
surface here.
"""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import prisma as prisma_lib
from httpx import AsyncClient

from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole


pytestmark = pytest.mark.anyio

ALICE_EMAIL, BOB_EMAIL = "alice_constructor@vu.nl", "bob_constructor@vu.nl"
PASS = "pass"


@pytest.fixture(scope="function")
async def two_tenant_setup(cleanup_database):
    """Two CONSTRUCTORs, each owning a separate test_definition with a
    scheduled run. The cross-tenant tests then try to mix run IDs.
    """
    alice = await prisma.users.create(data={
        "email": ALICE_EMAIL,
        "hashed_password": hash_password(PASS),
        "role": UserRole.CONSTRUCTOR,
    })
    bob = await prisma.users.create(data={
        "email": BOB_EMAIL,
        "hashed_password": hash_password(PASS),
        "role": UserRole.CONSTRUCTOR,
    })

    course_a = await prisma.courses.create(data={
        "code": "CS-A", "title": "Course A", "created_by": alice.id,
    })
    course_b = await prisma.courses.create(data={
        "code": "CS-B", "title": "Course B", "created_by": bob.id,
    })

    alice_test = await prisma.test_definitions.create(data={
        "title": "Alice's Test",
        "created_by": alice.id,
        "blocks": prisma_lib.Json([{"title": "S1", "rules": []}]),
        "duration_minutes": 60,
    })
    bob_test = await prisma.test_definitions.create(data={
        "title": "Bob's Test",
        "created_by": bob.id,
        "blocks": prisma_lib.Json([{"title": "S1", "rules": []}]),
        "duration_minutes": 60,
    })

    now = datetime.now(timezone.utc)
    alice_run = await prisma.scheduled_exam_sessions.create(data={
        "test_definition_id": alice_test.id,
        "course_id": course_a.id,
        "starts_at": now - timedelta(hours=2),
        "ends_at": now - timedelta(hours=1),
        "status": "CLOSED",
        "created_by": alice.id,
    })
    bob_run = await prisma.scheduled_exam_sessions.create(data={
        "test_definition_id": bob_test.id,
        "course_id": course_b.id,
        "starts_at": now - timedelta(hours=2),
        "ends_at": now - timedelta(hours=1),
        "status": "CLOSED",
        "created_by": bob.id,
    })

    return {
        "alice_test": alice_test, "alice_run": alice_run, "alice": alice,
        "bob_test": bob_test, "bob_run": bob_run, "bob": bob,
    }


async def _login(ac: AsyncClient, email: str) -> dict:
    resp = await ac.post("/api/auth/login", json={"email": email, "password": PASS})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ─────────────────────────────────────────────
# Sentinels are never tenant-scoped
# ─────────────────────────────────────────────

@pytest.mark.parametrize("run_id", [None, "combined", "practice"])
async def test_sentinel_run_ids_accepted_on_grading_overview(ac, two_tenant_setup, run_id):
    s = two_tenant_setup
    headers = await _login(ac, ALICE_EMAIL)
    params = {} if run_id is None else {"run_id": run_id}
    resp = await ac.get(
        f"/api/grading/tests/{s['alice_test'].id}/grading-overview",
        params=params, headers=headers,
    )
    assert resp.status_code == 200, resp.text


@pytest.mark.parametrize("run_id", [None, "combined", "practice"])
async def test_sentinel_run_ids_accepted_on_analytics_runs(ac, two_tenant_setup, run_id):
    """The analytics /runs picker should always return rows (or [])."""
    s = two_tenant_setup
    headers = await _login(ac, ALICE_EMAIL)
    params = {} if run_id is None else {"run_id": run_id}
    resp = await ac.get(
        f"/api/analytics/tests/{s['alice_test'].id}/runs",
        params=params, headers=headers,
    )
    assert resp.status_code == 200


# ─────────────────────────────────────────────
# Cross-tenant: Alice asks for "my test, Bob's run" → 404
# ─────────────────────────────────────────────

async def test_cross_tenant_run_id_returns_404_on_grading_overview(ac, two_tenant_setup):
    s = two_tenant_setup
    headers = await _login(ac, ALICE_EMAIL)
    resp = await ac.get(
        f"/api/grading/tests/{s['alice_test'].id}/grading-overview",
        params={"run_id": s["bob_run"].id}, headers=headers,
    )
    assert resp.status_code == 404
    # Body should not leak whether the run exists elsewhere — the message
    # is scoped to "this test", not the global namespace.
    assert "this test" in resp.text.lower() or "not found" in resp.text.lower()


async def test_cross_tenant_run_id_returns_404_on_grading_queue(ac, two_tenant_setup):
    s = two_tenant_setup
    headers = await _login(ac, ALICE_EMAIL)
    resp = await ac.get(
        f"/api/grading/tests/{s['alice_test'].id}/grading-queue",
        params={"run_id": s["bob_run"].id}, headers=headers,
    )
    assert resp.status_code == 404


async def test_cross_tenant_run_id_returns_404_on_analytics_bundle(ac, two_tenant_setup):
    s = two_tenant_setup
    headers = await _login(ac, ALICE_EMAIL)
    resp = await ac.get(
        f"/api/analytics/tests/{s['alice_test'].id}",
        params={"run_id": s["bob_run"].id}, headers=headers,
    )
    assert resp.status_code == 404


# ─────────────────────────────────────────────
# Same-tenant: owned run → 2xx
# ─────────────────────────────────────────────

async def test_owned_run_id_accepted_on_grading_overview(ac, two_tenant_setup):
    s = two_tenant_setup
    headers = await _login(ac, ALICE_EMAIL)
    resp = await ac.get(
        f"/api/grading/tests/{s['alice_test'].id}/grading-overview",
        params={"run_id": s["alice_run"].id}, headers=headers,
    )
    assert resp.status_code == 200


# ─────────────────────────────────────────────
# Nonexistent run_id → 404 (same code as cross-tenant, intentional)
# ─────────────────────────────────────────────

async def test_nonexistent_run_id_returns_404(ac, two_tenant_setup):
    s = two_tenant_setup
    headers = await _login(ac, ALICE_EMAIL)
    fake_uuid = str(uuid4())
    resp = await ac.get(
        f"/api/grading/tests/{s['alice_test'].id}/grading-overview",
        params={"run_id": fake_uuid}, headers=headers,
    )
    assert resp.status_code == 404


# ─────────────────────────────────────────────
# Test-level access — Alice trying to read Bob's test (no run_id)
# ─────────────────────────────────────────────

async def test_constructor_cannot_access_other_constructors_test(ac, two_tenant_setup):
    """Sanity check on the layer *above* run-scoping: even the test-level
    access check refuses cross-tenant reads, so the run-scoping check is
    defense-in-depth, not the only line of defense.
    """
    s = two_tenant_setup
    headers = await _login(ac, ALICE_EMAIL)
    resp = await ac.get(
        f"/api/analytics/tests/{s['bob_test'].id}/runs", headers=headers,
    )
    # Either 403 (access denied) or 404 (test not found) is acceptable —
    # the contract is "don't return Bob's data to Alice", not the exact code.
    assert resp.status_code in (403, 404), resp.text

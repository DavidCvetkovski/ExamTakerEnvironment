"""Epoch 15 — self-heal incident capture.

Covers the data-collection layer: the ``/feedback`` write path, the admin-only
read feed, RBAC on both, and the service-level fingerprint deduplication that
keeps a crash-looping fault as one actionable row.
"""
import pytest
from httpx import AsyncClient

from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.self_heal_incident import SelfHealIncidentSource, SelfHealSeverity
from app.models.user import UserRole
from app.services import self_heal_service

ADMIN_EMAIL, ADMIN_PASS = "admin_selfheal@vu.nl", "adminpass123"
STUDENT_EMAIL, STUDENT_PASS = "student_selfheal@vu.nl", "studpass123"


@pytest.fixture(scope="function")
async def setup_users(cleanup_database):
    await prisma.users.create(
        data={
            "email": ADMIN_EMAIL,
            "hashed_password": hash_password(ADMIN_PASS),
            "role": UserRole.ADMIN,
        }
    )
    await prisma.users.create(
        data={
            "email": STUDENT_EMAIL,
            "hashed_password": hash_password(STUDENT_PASS),
            "role": UserRole.STUDENT,
        }
    )


async def login(ac: AsyncClient, email: str, password: str) -> str:
    resp = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Feedback write path
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_submit_feedback_creates_incident(ac: AsyncClient, setup_users):
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    resp = await ac.post(
        "/api/feedback",
        json={"message": "The grading page throws when I refresh", "path": "/grading/123"},
        headers=auth(token),
    )
    assert resp.status_code == 202, resp.text

    rows = await prisma.self_heal_incidents.find_many()
    assert len(rows) == 1
    row = rows[0]
    assert row.source == SelfHealIncidentSource.USER_FEEDBACK.value
    assert row.severity == SelfHealSeverity.WARNING.value
    assert row.user_role == UserRole.STUDENT.value
    # Path is normalized in the fingerprint, but stored verbatim for the agent.
    assert row.request_path == "/grading/123"
    # PII guard: the user's identity is never persisted.
    assert STUDENT_EMAIL not in (row.message or "")


@pytest.mark.anyio
async def test_feedback_requires_auth(ac: AsyncClient, setup_users):
    resp = await ac.post("/api/feedback", json={"message": "anon report"})
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_feedback_rejects_empty_message(ac: AsyncClient, setup_users):
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    resp = await ac.post("/api/feedback", json={"message": ""}, headers=auth(token))
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Admin read feed (RBAC)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_incident_feed_is_admin_only(ac: AsyncClient, setup_users):
    student_token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    resp = await ac.get("/api/self-heal/incidents", headers=auth(student_token))
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_admin_lists_incidents_paginated(ac: AsyncClient, setup_users):
    student_token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    await ac.post(
        "/api/feedback",
        json={"message": "Something broke on submit"},
        headers=auth(student_token),
    )

    admin_token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    resp = await ac.get(
        "/api/self-heal/incidents?page=1&page_size=10", headers=auth(admin_token)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["page"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["source"] == SelfHealIncidentSource.USER_FEEDBACK.value


# ---------------------------------------------------------------------------
# Service-level deduplication (the core data-quality guarantee)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_recurring_exception_dedups_by_fingerprint(cleanup_database):
    """The same fault from the same route collapses onto one incident."""
    err = ValueError("boom")
    for _ in range(3):
        await self_heal_service.record_exception(
            exc=err,
            request_method="GET",
            request_path="/api/sessions/abc",
            traceback_text="Traceback...\nValueError: boom",
        )

    rows = await prisma.self_heal_incidents.find_many()
    assert len(rows) == 1
    assert rows[0].occurrences == 3
    assert rows[0].source == SelfHealIncidentSource.RUNTIME_EXCEPTION.value
    assert rows[0].severity == SelfHealSeverity.CRITICAL.value


@pytest.mark.anyio
async def test_distinct_routes_are_separate_incidents(cleanup_database):
    err = ValueError("boom")
    await self_heal_service.record_exception(exc=err, request_path="/api/grading/x")
    await self_heal_service.record_exception(exc=err, request_path="/api/items/y")
    rows = await prisma.self_heal_incidents.find_many()
    assert len(rows) == 2


@pytest.mark.anyio
async def test_uuid_routes_collapse_to_one_incident(cleanup_database):
    """Per-request UUIDs in the path must not fragment the same fault."""
    err = KeyError("missing")
    await self_heal_service.record_exception(
        exc=err, request_path="/api/sessions/11111111-1111-1111-1111-111111111111"
    )
    await self_heal_service.record_exception(
        exc=err, request_path="/api/sessions/22222222-2222-2222-2222-222222222222"
    )
    rows = await prisma.self_heal_incidents.find_many()
    assert len(rows) == 1
    assert rows[0].occurrences == 2

"""Epoch 12 LTI context / resource-link mapping endpoint tests.

These are the instructor/admin bindings that make a learner launch resolvable:
Canvas context -> OpenVision course, Canvas resource link -> scheduled session.
"""

import pytest
from httpx import AsyncClient
from datetime import datetime, timedelta, timezone

from prisma import Json
from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole


@pytest.fixture(autouse=True)
async def use_cleanup(cleanup_database):
    pass


async def _make_user(email: str, role: UserRole, password: str = "pass1234"):
    return await prisma.users.create(
        data={
            "email": email,
            "hashed_password": hash_password(password),
            "role": role.value,
            "is_active": True,
        }
    )


async def _login(ac: AsyncClient, email: str, password: str = "pass1234") -> str:
    resp = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _seed_links():
    """Create a platform + deployment with one unmapped context and resource link."""
    platform = await prisma.lti_platforms.create(
        data={
            "name": "Canvas",
            "issuer": "https://canvas.example.edu",
            "client_id": "client-1",
            "auth_login_url": "https://canvas.example.edu/auth",
            "auth_token_url": "https://canvas.example.edu/token",
            "auth_jwks_url": "https://canvas.example.edu/jwks",
            "deployment_ids": Json(["dep-a"]),
            "is_active": True,
        }
    )
    deployment = await prisma.lti_deployments.create(
        data={"platform_id": str(platform.id), "deployment_id": "dep-a", "is_active": True}
    )
    context = await prisma.lti_context_links.create(
        data={
            "platform_id": str(platform.id),
            "deployment_id": str(deployment.id),
            "context_id": "ctx-1",
            "context_title": "Intro to CS",
        }
    )
    resource = await prisma.lti_resource_links.create(
        data={
            "platform_id": str(platform.id),
            "deployment_id": str(deployment.id),
            "context_link_id": str(context.id),
            "resource_link_id": "res-1",
            "resource_title": "Midterm",
        }
    )
    return platform, deployment, context, resource


async def _make_course_and_session():
    course = await prisma.courses.create(data={"code": "CS101", "title": "Intro"})
    test_def = await prisma.test_definitions.create(
        data={"title": "Quiz", "blocks": Json([]), "duration_minutes": 60, "course_id": str(course.id)}
    )
    scheduled = await prisma.scheduled_exam_sessions.create(
        data={
            "course_id": str(course.id),
            "test_definition_id": str(test_def.id),
            "starts_at": datetime.now(timezone.utc),
            "ends_at": datetime.now(timezone.utc) + timedelta(hours=2),
        }
    )
    return course, test_def, scheduled


# ---------------------------------------------------------------------------
# Context mapping
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_constructor_maps_context_to_course(ac: AsyncClient):
    await _make_user("c@vu.nl", UserRole.CONSTRUCTOR)
    token = await _login(ac, "c@vu.nl")
    _, _, context, _ = await _seed_links()
    course, _, _ = await _make_course_and_session()

    resp = await ac.patch(
        f"/api/lti/contexts/{context.id}",
        json={"course_id": str(course.id)},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert resp.json()["course_id"] == str(course.id)

    row = await prisma.lti_context_links.find_unique(where={"id": str(context.id)})
    assert row.course_id == str(course.id)


@pytest.mark.anyio
async def test_unmapped_only_filter_lists_then_hides_after_mapping(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")
    _, _, context, _ = await _seed_links()
    course, _, _ = await _make_course_and_session()

    listed = await ac.get("/api/lti/contexts?unmapped_only=true", headers=_auth(token))
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    await ac.patch(
        f"/api/lti/contexts/{context.id}",
        json={"course_id": str(course.id)},
        headers=_auth(token),
    )
    after = await ac.get("/api/lti/contexts?unmapped_only=true", headers=_auth(token))
    assert after.json()["total"] == 0


@pytest.mark.anyio
async def test_map_context_unknown_course_404(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")
    _, _, context, _ = await _seed_links()

    resp = await ac.patch(
        f"/api/lti/contexts/{context.id}",
        json={"course_id": "00000000-0000-0000-0000-000000000000"},
        headers=_auth(token),
    )
    assert resp.status_code == 404
    assert "course" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_student_cannot_map_context(ac: AsyncClient):
    await _make_user("s@vu.nl", UserRole.STUDENT)
    token = await _login(ac, "s@vu.nl")
    _, _, context, _ = await _seed_links()
    course, _, _ = await _make_course_and_session()

    resp = await ac.patch(
        f"/api/lti/contexts/{context.id}",
        json={"course_id": str(course.id)},
        headers=_auth(token),
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Resource-link mapping
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_map_resource_link_to_scheduled_session(ac: AsyncClient):
    await _make_user("c@vu.nl", UserRole.CONSTRUCTOR)
    token = await _login(ac, "c@vu.nl")
    _, _, _, resource = await _seed_links()
    _, test_def, scheduled = await _make_course_and_session()

    resp = await ac.patch(
        f"/api/lti/resource-links/{resource.id}",
        json={"scheduled_session_id": str(scheduled.id), "test_definition_id": str(test_def.id)},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["scheduled_session_id"] == str(scheduled.id)
    assert body["test_definition_id"] == str(test_def.id)


@pytest.mark.anyio
async def test_map_resource_link_requires_a_target(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")
    _, _, _, resource = await _seed_links()

    resp = await ac.patch(
        f"/api/lti/resource-links/{resource.id}", json={}, headers=_auth(token)
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_map_resource_link_unknown_session_404(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")
    _, _, _, resource = await _seed_links()

    resp = await ac.patch(
        f"/api/lti/resource-links/{resource.id}",
        json={"scheduled_session_id": "00000000-0000-0000-0000-000000000000"},
        headers=_auth(token),
    )
    assert resp.status_code == 404

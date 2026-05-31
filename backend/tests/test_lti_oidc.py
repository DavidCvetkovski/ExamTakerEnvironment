"""Epoch 12 LTI 1.3 OIDC login initiation tests."""

from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient

from prisma import Json
from app.core.prisma_db import prisma


@pytest.fixture(autouse=True)
async def use_cleanup(cleanup_database):
    pass


async def _register_platform(
    name: str = "Canvas Sandbox",
    issuer: str = "https://canvas.example.edu",
    client_id: str = "client-1234",
    is_active: bool = True,
):
    platform = await prisma.lti_platforms.create(
        data={
            "name": name,
            "issuer": issuer,
            "client_id": client_id,
            "auth_login_url": "https://canvas.example.edu/api/lti/authorize_redirect",
            "auth_token_url": "https://canvas.example.edu/login/oauth2/token",
            "auth_jwks_url": "https://canvas.example.edu/api/lti/security/jwks",
            "deployment_ids": Json(["deployment-a"]),
            "canvas_base_url": "https://canvas.example.edu",
            "is_active": is_active,
        }
    )
    await prisma.lti_deployments.create(
        data={
            "platform_id": str(platform.id),
            "deployment_id": "deployment-a",
            "is_active": True,
        }
    )
    return platform


@pytest.mark.anyio
async def test_login_initiation_unknown_issuer(ac: AsyncClient):
    # GET unknown issuer
    resp_get = await ac.get(
        "/api/lti/login",
        params={
            "iss": "https://unknown-platform.edu",
            "login_hint": "user-hint-1",
            "target_link_uri": "http://test/exam",
        },
    )
    assert resp_get.status_code == 400
    assert "Platform registration not found" in resp_get.json()["detail"]

    # POST unknown issuer
    resp_post = await ac.post(
        "/api/lti/login",
        data={
            "iss": "https://unknown-platform.edu",
            "login_hint": "user-hint-1",
            "target_link_uri": "http://test/exam",
        },
    )
    assert resp_post.status_code == 400
    assert "Platform registration not found" in resp_post.json()["detail"]


@pytest.mark.anyio
async def test_login_initiation_inactive_platform(ac: AsyncClient):
    await _register_platform(is_active=False)

    resp = await ac.get(
        "/api/lti/login",
        params={
            "iss": "https://canvas.example.edu",
            "login_hint": "user-hint-1",
            "target_link_uri": "http://test/exam",
        },
    )
    assert resp.status_code == 400
    assert "Platform registration not found or inactive" in resp.json()["detail"]


@pytest.mark.anyio
async def test_login_initiation_success_get(ac: AsyncClient):
    await _register_platform()

    resp = await ac.get(
        "/api/lti/login",
        params={
            "iss": "https://canvas.example.edu",
            "login_hint": "user-hint-12345",
            "target_link_uri": "http://test/exam",
            "lti_message_hint": "msg-hint-999",
        },
    )

    # LTI OIDC redirect should be 302 Found
    assert resp.status_code == 302
    redirect_url = resp.headers["Location"]
    parsed = urlparse(redirect_url)
    assert parsed.netloc == "canvas.example.edu"
    assert parsed.path == "/api/lti/authorize_redirect"

    # Verify query parameters
    query = parse_qs(parsed.query)
    assert query["scope"] == ["openid"]
    assert query["response_type"] == ["id_token"]
    assert query["response_mode"] == ["form_post"]
    assert query["prompt"] == ["none"]
    assert query["client_id"] == ["client-1234"]
    assert query["login_hint"] == ["user-hint-12345"]
    assert query["lti_message_hint"] == ["msg-hint-999"]
    assert "state" in query
    assert "nonce" in query

    state = query["state"][0]
    nonce = query["nonce"][0]

    # Verify database state persistence
    db_state = await prisma.lti_oidc_states.find_unique(where={"state": state})
    assert db_state is not None
    assert db_state.nonce == nonce
    assert db_state.issuer == "https://canvas.example.edu"
    assert db_state.client_id == "client-1234"
    assert db_state.target_link_uri == "http://test/exam"
    assert db_state.message_hint == "msg-hint-999"
    assert db_state.consumed_at is None


@pytest.mark.anyio
async def test_login_initiation_success_post(ac: AsyncClient):
    await _register_platform()

    resp = await ac.post(
        "/api/lti/login",
        data={
            "iss": "https://canvas.example.edu",
            "login_hint": "user-hint-12345",
            "target_link_uri": "http://test/exam",
        },
    )

    assert resp.status_code == 302
    redirect_url = resp.headers["Location"]
    parsed = urlparse(redirect_url)
    query = parse_qs(parsed.query)

    assert query["client_id"] == ["client-1234"]
    assert query["login_hint"] == ["user-hint-12345"]
    assert "state" in query
    assert "nonce" in query


@pytest.mark.anyio
async def test_login_initiation_ambiguous_issuer(ac: AsyncClient):
    # Register issuer canvas.example.edu twice with different client IDs
    await _register_platform(client_id="client-1")
    await _register_platform(client_id="client-2")

    # Request without client_id should fail
    resp = await ac.get(
        "/api/lti/login",
        params={
            "iss": "https://canvas.example.edu",
            "login_hint": "user-hint-1",
            "target_link_uri": "http://test/exam",
        },
    )
    assert resp.status_code == 400
    assert "Multiple LTI platform registrations found" in resp.json()["detail"]

    # Request with explicit client_id should succeed
    resp_ok = await ac.get(
        "/api/lti/login",
        params={
            "iss": "https://canvas.example.edu",
            "client_id": "client-2",
            "login_hint": "user-hint-1",
            "target_link_uri": "http://test/exam",
        },
    )
    assert resp_ok.status_code == 302
    parsed = urlparse(resp_ok.headers["Location"])
    query = parse_qs(parsed.query)
    assert query["client_id"] == ["client-2"]

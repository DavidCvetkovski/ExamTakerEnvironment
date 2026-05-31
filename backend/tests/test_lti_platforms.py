"""Epoch 12 LTI platform registration and JWKS foundation tests."""

import pytest
from httpx import AsyncClient, ASGITransport

from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.main import app
from app.models.user import UserRole


@pytest.fixture
async def ac():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


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


def _platform_payload() -> dict:
    return {
        "name": "Canvas Sandbox",
        "issuer": "https://canvas.example.edu",
        "client_id": "10000000000001",
        "auth_login_url": "https://canvas.example.edu/api/lti/authorize_redirect",
        "auth_token_url": "https://canvas.example.edu/login/oauth2/token",
        "auth_jwks_url": "https://canvas.example.edu/api/lti/security/jwks",
        "deployment_ids": ["deployment-a", "deployment-b"],
        "canvas_base_url": "https://canvas.example.edu",
    }


@pytest.mark.anyio
async def test_admin_registers_platform_and_deployments(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")

    resp = await ac.post("/api/lti/platforms", json=_platform_payload(), headers=_auth(token))

    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Canvas Sandbox"
    assert body["issuer"] == "https://canvas.example.edu/"
    assert body["client_id"] == "10000000000001"
    assert body["deployment_ids"] == ["deployment-a", "deployment-b"]
    assert len(body["deployments"]) == 2

    audit = await prisma.integration_audit_logs.find_many(
        where={"integration": "lti", "action": "platform.create"}
    )
    assert len(audit) == 1
    assert audit[0].status == "success"


@pytest.mark.anyio
async def test_non_admin_cannot_register_platform(ac: AsyncClient):
    await _make_user("constructor@vu.nl", UserRole.CONSTRUCTOR)
    token = await _login(ac, "constructor@vu.nl")

    resp = await ac.post("/api/lti/platforms", json=_platform_payload(), headers=_auth(token))

    assert resp.status_code == 403


@pytest.mark.anyio
async def test_duplicate_issuer_client_rejected(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")
    payload = _platform_payload()

    assert (await ac.post("/api/lti/platforms", json=payload, headers=_auth(token))).status_code == 201
    duplicate = await ac.post("/api/lti/platforms", json=payload, headers=_auth(token))

    assert duplicate.status_code == 409


@pytest.mark.anyio
async def test_tool_key_rotation_publishes_public_jwks_only(ac: AsyncClient):
    await _make_user("admin@vu.nl", UserRole.ADMIN)
    token = await _login(ac, "admin@vu.nl")

    rotated = await ac.post("/api/lti/tool-keys/rotate", headers=_auth(token))
    assert rotated.status_code == 201
    kid = rotated.json()["kid"]

    jwks = await ac.get("/api/lti/jwks")
    assert jwks.status_code == 200
    body = jwks.json()
    assert len(body["keys"]) == 1
    public_key = body["keys"][0]
    assert public_key["kid"] == kid
    assert public_key["kty"] == "RSA"
    assert public_key["alg"] == "RS256"
    assert "n" in public_key
    assert "e" in public_key
    assert "d" not in public_key
    assert "p" not in public_key

    audit = await prisma.integration_audit_logs.find_many(
        where={"integration": "lti", "action": "tool_key.rotate"}
    )
    assert len(audit) == 1

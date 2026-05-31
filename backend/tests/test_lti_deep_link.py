"""Epoch 12 LTI 1.3 Deep Linking tests.

Covers the deep-linking launch (which stashes a deep-link session) and the
instructor response flow that signs a content-item JWT for Canvas.
"""

import time
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient
from jose import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from prisma import Json
from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole
from app.services.lti import jwks_client
from app.services.lti.jwks_service import _b64url_uint, rotate_tool_key

ISS = "https://canvas.example.edu"
CLIENT_ID = "client-1"
DEPLOYMENT_ID = "dep-a"
KID = "dl-platform-key"
INSTRUCTOR = ["http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"]
RETURN_URL = "https://canvas.example.edu/courses/1/deep_link_return"

_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_PEM = _KEY.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
).decode("ascii")
_PUB = _KEY.public_key().public_numbers()
PUBLIC_JWK = {
    "kty": "RSA", "kid": KID, "use": "sig", "alg": "RS256",
    "n": _b64url_uint(_PUB.n), "e": _b64url_uint(_PUB.e),
}


@pytest.fixture(autouse=True)
async def use_cleanup(cleanup_database):
    pass


@pytest.fixture(autouse=True)
def patch_jwks(monkeypatch):
    async def fake_fetch(jwks_url):
        return {"keys": [PUBLIC_JWK]}

    jwks_client.clear_cache()
    monkeypatch.setattr(jwks_client, "_fetch_jwks", fake_fetch)
    yield
    jwks_client.clear_cache()


async def _make_user(email, role=UserRole.CONSTRUCTOR, password="pass1234"):
    return await prisma.users.create(
        data={"email": email, "hashed_password": hash_password(password),
              "role": role.value, "is_active": True}
    )


async def _login(ac, email, password="pass1234"):
    resp = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _register_platform():
    platform = await prisma.lti_platforms.create(
        data={
            "name": "Canvas", "issuer": ISS, "client_id": CLIENT_ID,
            "auth_login_url": f"{ISS}/auth", "auth_token_url": f"{ISS}/token",
            "auth_jwks_url": f"{ISS}/jwks", "deployment_ids": Json([DEPLOYMENT_ID]),
            "is_active": True,
        }
    )
    deployment = await prisma.lti_deployments.create(
        data={"platform_id": str(platform.id), "deployment_id": DEPLOYMENT_ID, "is_active": True}
    )
    return platform, deployment


async def _create_state(nonce="nonce-dl"):
    state = f"state-{int(time.time()*1000)}"
    await prisma.lti_oidc_states.create(
        data={"state": state, "nonce": nonce, "issuer": ISS, "client_id": CLIENT_ID,
              "target_link_uri": "http://test/dl",
              "expires_at": datetime.now(timezone.utc) + timedelta(seconds=300)}
    )
    return state, nonce


def _dl_id_token(nonce):
    now = int(time.time())
    c = "https://purl.imsglobal.org/spec/lti/claim/"
    dl = "https://purl.imsglobal.org/spec/lti-dl/claim/"
    payload = {
        "iss": ISS, "sub": "instructor-1", "aud": CLIENT_ID, "exp": now + 300, "iat": now,
        "nonce": nonce,
        f"{c}deployment_id": DEPLOYMENT_ID,
        f"{c}message_type": "LtiDeepLinkingRequest",
        f"{c}version": "1.3.0",
        f"{c}roles": INSTRUCTOR,
        f"{c}context": {"id": "ctx-1", "title": "Course"},
        f"{dl}deep_linking_settings": {"deep_link_return_url": RETURN_URL, "data": "opaque-123"},
        "name": "Prof X",
    }
    return jwt.encode(payload, _PEM, algorithm="RS256", headers={"kid": KID})


async def _seed_deep_link_session(user_id, platform, deployment, data="opaque-123"):
    return await prisma.lti_deep_link_sessions.create(
        data={
            "platform_id": str(platform.id), "deployment_id": str(deployment.id),
            "user_id": user_id, "return_url": RETURN_URL, "data": data,
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
        }
    )


async def _scheduled_session():
    course = await prisma.courses.create(data={"code": "CS1", "title": "Intro"})
    td = await prisma.test_definitions.create(
        data={"title": "Quiz", "blocks": Json([]), "duration_minutes": 60, "course_id": str(course.id)}
    )
    return await prisma.scheduled_exam_sessions.create(
        data={"course_id": str(course.id), "test_definition_id": str(td.id),
              "starts_at": datetime.now(timezone.utc),
              "ends_at": datetime.now(timezone.utc) + timedelta(hours=2)}
    )


# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_deep_linking_launch_creates_session(ac: AsyncClient):
    platform, _ = await _register_platform()
    state, nonce = await _create_state()

    resp = await ac.post("/api/lti/launch", data={"state": state, "id_token": _dl_id_token(nonce)})
    assert resp.status_code == 302
    next_path = parse_qs(urlparse(resp.headers["Location"]).query)["next"][0]
    assert next_path.startswith("/integrations/lti/deep-link/")

    session = await prisma.lti_deep_link_sessions.find_first(where={"platform_id": str(platform.id)})
    assert session is not None
    assert session.return_url == RETURN_URL
    assert session.data == "opaque-123"


@pytest.mark.anyio
async def test_respond_signs_verifiable_content_item(ac: AsyncClient):
    user = await _make_user("prof@vu.nl")
    token = await _login(ac, "prof@vu.nl")
    await rotate_tool_key(str(user.id))  # active tool key to sign the response
    platform, deployment = await _register_platform()
    session = await _seed_deep_link_session(str(user.id), platform, deployment)
    scheduled = await _scheduled_session()

    resp = await ac.post(
        f"/api/lti/deep-link/{session.id}/respond",
        json={"title": "Week 1 Quiz", "scheduled_session_id": str(scheduled.id)},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["return_url"] == RETURN_URL

    # The response JWT verifies against the tool's published JWKS.
    jwks = (await ac.get("/api/lti/jwks")).json()["keys"]
    decoded = jwt.decode(body["jwt"], jwks[0], algorithms=["RS256"], audience=ISS, issuer=CLIENT_ID)
    assert decoded["https://purl.imsglobal.org/spec/lti/claim/message_type"] == "LtiDeepLinkingResponse"
    items = decoded["https://purl.imsglobal.org/spec/lti-dl/claim/content_items"]
    assert items[0]["type"] == "ltiResourceLink"
    assert decoded["https://purl.imsglobal.org/spec/lti-dl/claim/data"] == "opaque-123"

    # A bound resource link now points at the scheduled session.
    rl_id = items[0]["custom"]["openvision_resource_link_id"]
    rl = await prisma.lti_resource_links.find_unique(where={"id": rl_id})
    assert rl.scheduled_session_id == str(scheduled.id)
    # Session is single-use.
    consumed = await prisma.lti_deep_link_sessions.find_unique(where={"id": str(session.id)})
    assert consumed.consumed_at is not None


@pytest.mark.anyio
async def test_respond_requires_selection(ac: AsyncClient):
    user = await _make_user("prof@vu.nl")
    token = await _login(ac, "prof@vu.nl")
    await rotate_tool_key(str(user.id))
    platform, deployment = await _register_platform()
    session = await _seed_deep_link_session(str(user.id), platform, deployment)

    resp = await ac.post(
        f"/api/lti/deep-link/{session.id}/respond",
        json={"title": "Nothing selected"},
        headers=_auth(token),
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_get_session_rejects_non_owner(ac: AsyncClient):
    owner = await _make_user("owner@vu.nl")
    await _make_user("other@vu.nl")
    other_token = await _login(ac, "other@vu.nl")
    platform, deployment = await _register_platform()
    session = await _seed_deep_link_session(str(owner.id), platform, deployment)

    resp = await ac.get(f"/api/lti/deep-link/{session.id}", headers=_auth(other_token))
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_respond_replay_rejected(ac: AsyncClient):
    user = await _make_user("prof@vu.nl")
    token = await _login(ac, "prof@vu.nl")
    await rotate_tool_key(str(user.id))
    platform, deployment = await _register_platform()
    session = await _seed_deep_link_session(str(user.id), platform, deployment)
    scheduled = await _scheduled_session()
    body = {"title": "Q", "scheduled_session_id": str(scheduled.id)}

    first = await ac.post(f"/api/lti/deep-link/{session.id}/respond", json=body, headers=_auth(token))
    assert first.status_code == 200
    second = await ac.post(f"/api/lti/deep-link/{session.id}/respond", json=body, headers=_auth(token))
    assert second.status_code == 409

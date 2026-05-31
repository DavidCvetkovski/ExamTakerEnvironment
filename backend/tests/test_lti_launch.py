"""Epoch 12 LTI 1.3 launch validation tests.

Covers the OIDC launch response endpoint (`POST /api/lti/launch`): signature
verification against the platform JWKS, the LTI claim checks, single-use state
(replay protection), and user/context/resource mapping. The platform JWKS fetch
is monkeypatched so tests sign launches with a locally generated RSA key.
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
from app.services.lti import jwks_client
from app.services.lti.jwks_service import _b64url_uint

ISS = "https://canvas.example.edu"
CLIENT_ID = "client-1234"
DEPLOYMENT_ID = "deployment-a"
KID = "test-key-1"

LEARNER = ["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"]
INSTRUCTOR = ["http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"]

# One RSA key for the whole module: PEM for signing, public JWK for the JWKS.
_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_PRIVATE_PEM = _KEY.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
).decode("ascii")
_PUB = _KEY.public_key().public_numbers()
PUBLIC_JWK = {
    "kty": "RSA", "kid": KID, "use": "sig", "alg": "RS256",
    "n": _b64url_uint(_PUB.n), "e": _b64url_uint(_PUB.e),
}

# A second, unrelated key used to forge a signature the JWKS won't verify.
_WRONG_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_WRONG_PEM = _WRONG_KEY.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
).decode("ascii")


@pytest.fixture(autouse=True)
async def use_cleanup(cleanup_database):
    pass


@pytest.fixture(autouse=True)
def patch_jwks(monkeypatch):
    """Serve the local public JWK in place of a real platform fetch."""
    async def fake_fetch(jwks_url):
        return {"keys": [PUBLIC_JWK]}

    jwks_client.clear_cache()
    monkeypatch.setattr(jwks_client, "_fetch_jwks", fake_fetch)
    yield
    jwks_client.clear_cache()


# ---------------------------------------------------------------------------
# Fixtures / builders
# ---------------------------------------------------------------------------

async def _register_platform():
    platform = await prisma.lti_platforms.create(
        data={
            "name": "Canvas Sandbox",
            "issuer": ISS,
            "client_id": CLIENT_ID,
            "auth_login_url": f"{ISS}/api/lti/authorize_redirect",
            "auth_token_url": f"{ISS}/login/oauth2/token",
            "auth_jwks_url": f"{ISS}/api/lti/security/jwks",
            "deployment_ids": Json([DEPLOYMENT_ID]),
            "is_active": True,
        }
    )
    deployment = await prisma.lti_deployments.create(
        data={"platform_id": str(platform.id), "deployment_id": DEPLOYMENT_ID, "is_active": True}
    )
    return platform, deployment


async def _create_state(*, nonce="nonce-abc", expires_in=300):
    state = f"state-{int(time.time()*1000)}-{nonce}"
    await prisma.lti_oidc_states.create(
        data={
            "state": state,
            "nonce": nonce,
            "issuer": ISS,
            "client_id": CLIENT_ID,
            "target_link_uri": "http://test/exam",
            "expires_at": datetime.now(timezone.utc) + timedelta(seconds=expires_in),
        }
    )
    return state, nonce


async def _create_scheduled_session(platform, deployment, context_id="ctx-1", resource_id="res-1"):
    """Create a fully mapped course/context/resource chain for a student launch."""
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
    context_link = await prisma.lti_context_links.create(
        data={
            "platform_id": str(platform.id),
            "deployment_id": str(deployment.id),
            "context_id": context_id,
            "course_id": str(course.id),
        }
    )
    await prisma.lti_resource_links.create(
        data={
            "platform_id": str(platform.id),
            "deployment_id": str(deployment.id),
            "context_link_id": str(context_link.id),
            "resource_link_id": resource_id,
            "scheduled_session_id": str(scheduled.id),
        }
    )
    return course, scheduled


def _id_token(
    nonce,
    *,
    roles,
    message_type="LtiResourceLinkRequest",
    aud=CLIENT_ID,
    iss=ISS,
    deployment_id=DEPLOYMENT_ID,
    version="1.3.0",
    context_id="ctx-1",
    resource_id="res-1",
    sub="lti-user-1",
    sign_pem=_PRIVATE_PEM,
    nonce_override=None,
):
    now = int(time.time())
    claim = "https://purl.imsglobal.org/spec/lti/claim/"
    payload = {
        "iss": iss,
        "sub": sub,
        "aud": aud,
        "exp": now + 300,
        "iat": now,
        "nonce": nonce_override or nonce,
        f"{claim}deployment_id": deployment_id,
        f"{claim}message_type": message_type,
        f"{claim}version": version,
        f"{claim}roles": roles,
        f"{claim}context": {"id": context_id, "label": "CS101", "title": "Intro"},
        f"{claim}resource_link": {"id": resource_id, "title": "Quiz"},
        "email": "student@uni.edu",
        "name": "Test Student",
    }
    return jwt.encode(payload, sign_pem, algorithm="RS256", headers={"kid": KID})


async def _launch(ac, state, id_token):
    return await ac.post("/api/lti/launch", data={"state": state, "id_token": id_token})


def _next_path(location: str) -> str:
    """Extract the decoded ``next`` target from a launch-resolver redirect."""
    parsed = urlparse(location)
    assert parsed.path == "/lti/launch"
    return parse_qs(parsed.query)["next"][0]


# ---------------------------------------------------------------------------
# Happy paths
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_student_launch_success(ac: AsyncClient):
    platform, deployment = await _register_platform()
    course, scheduled = await _create_scheduled_session(platform, deployment)
    state, nonce = await _create_state()

    resp = await _launch(ac, state, _id_token(nonce, roles=LEARNER))

    assert resp.status_code == 302
    assert _next_path(resp.headers["Location"]) == f"/exam/join/{scheduled.id}"
    assert "refresh_token=" in resp.headers.get("set-cookie", "")

    # State is consumed (single-use), user provisioned + linked, enrolled, audited.
    consumed = await prisma.lti_oidc_states.find_unique(where={"state": state})
    assert consumed.consumed_at is not None
    link = await prisma.lti_user_links.find_unique(
        where={"issuer_subject": {"issuer": ISS, "subject": "lti-user-1"}}
    )
    assert link is not None
    enrollment = await prisma.course_enrollments.find_first(
        where={"course_id": str(course.id), "student_id": link.user_id}
    )
    assert enrollment is not None and enrollment.is_active
    audit = await prisma.lti_launch_audits.find_first(where={"status": "success"})
    assert audit is not None and audit.message_type == "LtiResourceLinkRequest"


@pytest.mark.anyio
async def test_instructor_launch_redirects_to_resource_mapping(ac: AsyncClient):
    platform, deployment = await _register_platform()
    state, nonce = await _create_state()

    resp = await _launch(ac, state, _id_token(nonce, roles=INSTRUCTOR))

    assert resp.status_code == 302
    assert _next_path(resp.headers["Location"]).startswith("/integrations/lti/resource-links/")
    # Instructor account is provisioned as a constructor, never a student exam.
    link = await prisma.lti_user_links.find_unique(
        where={"issuer_subject": {"issuer": ISS, "subject": "lti-user-1"}}
    )
    user = await prisma.users.find_unique(where={"id": link.user_id})
    assert user.role == "CONSTRUCTOR"


# ---------------------------------------------------------------------------
# Security / rejection paths
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_forged_signature_rejected(ac: AsyncClient):
    await _register_platform()
    state, nonce = await _create_state()

    resp = await _launch(ac, state, _id_token(nonce, roles=LEARNER, sign_pem=_WRONG_PEM))

    assert resp.status_code == 400
    # State must survive a forged attempt so a legitimate retry is still possible.
    row = await prisma.lti_oidc_states.find_unique(where={"state": state})
    assert row.consumed_at is None
    assert await prisma.lti_launch_audits.find_first(where={"status": "failed"}) is not None


@pytest.mark.anyio
async def test_expired_state_rejected(ac: AsyncClient):
    await _register_platform()
    state, nonce = await _create_state(expires_in=-10)

    resp = await _launch(ac, state, _id_token(nonce, roles=LEARNER))
    assert resp.status_code == 400
    assert "expired" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_replayed_state_rejected(ac: AsyncClient):
    platform, deployment = await _register_platform()
    await _create_scheduled_session(platform, deployment)
    state, nonce = await _create_state()

    first = await _launch(ac, state, _id_token(nonce, roles=LEARNER))
    assert first.status_code == 302
    # Same state + token again → consumed → rejected.
    second = await _launch(ac, state, _id_token(nonce, roles=LEARNER))
    assert second.status_code == 400


@pytest.mark.anyio
async def test_nonce_mismatch_rejected(ac: AsyncClient):
    await _register_platform()
    state, nonce = await _create_state()

    resp = await _launch(ac, state, _id_token(nonce, roles=LEARNER, nonce_override="wrong-nonce"))
    assert resp.status_code == 400
    assert "nonce" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_wrong_audience_rejected(ac: AsyncClient):
    await _register_platform()
    state, nonce = await _create_state()

    resp = await _launch(ac, state, _id_token(nonce, roles=LEARNER, aud="someone-else"))
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_unregistered_deployment_rejected(ac: AsyncClient):
    await _register_platform()
    state, nonce = await _create_state()

    resp = await _launch(ac, state, _id_token(nonce, roles=LEARNER, deployment_id="rogue-deploy"))
    assert resp.status_code == 400
    assert "deployment" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_unsupported_message_type_rejected(ac: AsyncClient):
    await _register_platform()
    state, nonce = await _create_state()

    resp = await _launch(ac, state, _id_token(nonce, roles=LEARNER, message_type="LtiSubmissionReview"))
    assert resp.status_code == 400
    assert "message type" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_student_launch_unconfigured_course_rejected(ac: AsyncClient):
    """A learner launch into a context with no mapped OpenVision course fails."""
    await _register_platform()
    state, nonce = await _create_state()

    resp = await _launch(ac, state, _id_token(nonce, roles=LEARNER))
    assert resp.status_code == 400
    assert "course" in resp.json()["detail"].lower()

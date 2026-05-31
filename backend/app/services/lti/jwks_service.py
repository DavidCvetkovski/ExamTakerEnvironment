"""Tool key generation and JWKS publication for LTI 1.3."""

import base64
import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException, status
from jose import jwt
from prisma import Json

from app.core.config import settings
from app.core.prisma_db import prisma
from app.schemas.lti import LtiJwksResponse, LtiToolKeyResponse
from app.services.integration_audit_service import record_integration_audit


def _b64url_uint(value: int) -> str:
    """Encode an RSA integer as unpadded base64url, as required by JWK."""
    byte_length = max(1, (value.bit_length() + 7) // 8)
    encoded = base64.urlsafe_b64encode(value.to_bytes(byte_length, "big")).decode("ascii")
    return encoded.rstrip("=")


def _fernet() -> Fernet:
    """Derive the symmetric key used to encrypt stored private JWK material."""
    digest = hashlib.sha256(settings.LTI_PRIVATE_KEY_ENCRYPTION_KEY.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _generate_rsa_jwk_pair(kid: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Generate an RSA key pair represented as public/private JWK dicts."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_numbers = key.private_numbers()
    public_numbers = private_numbers.public_numbers
    public_jwk = {
        "kty": "RSA",
        "kid": kid,
        "use": "sig",
        "alg": "RS256",
        "n": _b64url_uint(public_numbers.n),
        "e": _b64url_uint(public_numbers.e),
    }
    private_jwk = {
        **public_jwk,
        "d": _b64url_uint(private_numbers.d),
        "p": _b64url_uint(private_numbers.p),
        "q": _b64url_uint(private_numbers.q),
        "dp": _b64url_uint(private_numbers.dmp1),
        "dq": _b64url_uint(private_numbers.dmq1),
        "qi": _b64url_uint(private_numbers.iqmp),
    }
    return public_jwk, private_jwk


def _encrypt_private_jwk(private_jwk: dict[str, Any]) -> str:
    """Encrypt private key material before database storage."""
    plaintext = json.dumps(private_jwk, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return _fernet().encrypt(plaintext).decode("ascii")


def _decrypt_private_jwk(ciphertext: str) -> dict[str, Any]:
    """Decrypt a stored private JWK back into its dict form."""
    return json.loads(_fernet().decrypt(ciphertext.encode("ascii")))


async def get_active_signing_key() -> tuple[str, dict[str, Any]]:
    """Return ``(kid, private_jwk)`` for the newest active tool key.

    Raises 500 when no key is configured — deep linking and AGS cannot sign
    without one, and a rotation must be performed by an admin first.
    """
    key = await prisma.lti_tool_keys.find_first(
        where={"is_active": True}, order={"created_at": "desc"}
    )
    if not key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No active LTI tool signing key configured. Rotate one first.",
        )
    return key.kid, _decrypt_private_jwk(key.encrypted_private_jwk)


async def sign_tool_jwt(claims: dict[str, Any]) -> str:
    """Sign a JWT with the active tool private key (RS256, kid header set).

    Used for the LTI Deep Linking response and AGS service-auth client
    assertions. The private key never leaves the backend.
    """
    kid, private_jwk = await get_active_signing_key()
    return jwt.encode(claims, private_jwk, algorithm="RS256", headers={"kid": kid})


async def rotate_tool_key(actor_user_id: str) -> LtiToolKeyResponse:
    """Create a new active LTI tool signing key and audit the rotation."""
    kid = f"openvision-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}"
    public_jwk, private_jwk = _generate_rsa_jwk_pair(kid)
    key = await prisma.lti_tool_keys.create(
        data={
            "kid": kid,
            "public_jwk": Json(public_jwk),
            "encrypted_private_jwk": _encrypt_private_jwk(private_jwk),
            "algorithm": "RS256",
            "is_active": True,
        }
    )
    await record_integration_audit(
        integration="lti",
        action="tool_key.rotate",
        status="success",
        actor_user_id=actor_user_id,
        resource_type="lti_tool_key",
        resource_id=str(key.id),
        metadata={"kid": kid},
    )
    return LtiToolKeyResponse.model_validate(key)


async def list_tool_keys() -> list[LtiToolKeyResponse]:
    """Return admin-safe metadata for tool signing keys."""
    keys = await prisma.lti_tool_keys.find_many(order={"created_at": "desc"})
    return [LtiToolKeyResponse.model_validate(key) for key in keys]


async def get_public_jwks() -> LtiJwksResponse:
    """Return active public LTI tool keys in JWKS format."""
    keys = await prisma.lti_tool_keys.find_many(
        where={"is_active": True},
        order={"created_at": "desc"},
    )
    return LtiJwksResponse(keys=[key.public_jwk for key in keys])

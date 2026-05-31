"""Outbound LTI Advantage service calls (AGS): platform OAuth2 + score push.

Token acquisition uses the LTI client-credentials grant with a tool-signed JWT
client assertion. Access tokens are cached per platform+scope until shortly
before expiry. Access tokens never leave the backend.
"""

import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Tuple

import httpx

from app.services.lti import jwks_service

AGS_SCORE_SCOPE = "https://purl.imsglobal.org/spec/lti-ags/scope/score"
_SCORE_CONTENT_TYPE = "application/vnd.ims.lis.v1.score+json"
_TIMEOUT = 10.0

# Cache: (platform_id, scope) -> (expires_at_epoch, access_token)
_TOKEN_CACHE: Dict[Tuple[str, str], Tuple[float, str]] = {}


async def _client_assertion(platform) -> str:
    """Build a tool-signed JWT proving the tool's identity to the platform."""
    now = int(time.time())
    claims = {
        "iss": platform.client_id,
        "sub": platform.client_id,
        "aud": platform.auth_token_url,
        "iat": now,
        "exp": now + 300,
        "jti": uuid.uuid4().hex,
    }
    return await jwks_service.sign_tool_jwt(claims)


async def get_access_token(platform, scope: str = AGS_SCORE_SCOPE) -> str:
    """Return a cached or freshly acquired platform access token for ``scope``."""
    cache_key = (str(platform.id), scope)
    cached = _TOKEN_CACHE.get(cache_key)
    if cached and cached[0] > time.monotonic():
        return cached[1]

    assertion = await _client_assertion(platform)
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(
            platform.auth_token_url,
            data={
                "grant_type": "client_credentials",
                "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                "client_assertion": assertion,
                "scope": scope,
            },
        )
        resp.raise_for_status()
        body = resp.json()

    token = body["access_token"]
    ttl = int(body.get("expires_in", 3600))
    # Refresh a minute early to avoid using a token that expires mid-flight.
    _TOKEN_CACHE[cache_key] = (time.monotonic() + max(30, ttl - 60), token)
    return token


def build_score_payload(*, subject: str, score_given: float, score_maximum: float) -> Dict[str, Any]:
    """Build an LTI AGS Score body for a fully-graded, completed attempt."""
    return {
        "userId": subject,
        "scoreGiven": score_given,
        "scoreMaximum": score_maximum,
        "activityProgress": "Completed",
        "gradingProgress": "FullyGraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


async def post_score(line_item_url: str, access_token: str, payload: Dict[str, Any]) -> httpx.Response:
    """POST a Score to the line item's ``/scores`` endpoint."""
    scores_url = line_item_url.rstrip("/") + "/scores"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        return await client.post(
            scores_url,
            content=json.dumps(payload),
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": _SCORE_CONTENT_TYPE,
            },
        )


def clear_token_cache() -> None:
    """Drop cached access tokens (used by tests)."""
    _TOKEN_CACHE.clear()

"""Platform JWKS fetching with a per-issuer TTL cache.

LTI launch validation must verify the platform-signed ``id_token`` against the
platform's published JWKS. Fetching that document on every launch would be slow
and fragile, so we cache it in-process keyed by the JWKS URL with a short TTL
(CLAUDE.md §4: launch validation must be fast and cache JWKS by issuer with TTL).
"""

import time
from typing import Any, Dict, Optional, Tuple

import httpx

# Cache: jwks_url -> (expires_at_epoch, jwks_document)
_JWKS_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}

# How long a fetched JWKS document is trusted before re-fetching.
_JWKS_TTL_SECONDS = 600
# Network timeout for the JWKS fetch. Platforms should answer quickly.
_FETCH_TIMEOUT_SECONDS = 5.0


def _now() -> float:
    return time.monotonic()


async def _fetch_jwks(jwks_url: str) -> Dict[str, Any]:
    """Fetch a JWKS document over HTTPS. Raises on transport/HTTP errors."""
    async with httpx.AsyncClient(timeout=_FETCH_TIMEOUT_SECONDS) as client:
        resp = await client.get(jwks_url)
        resp.raise_for_status()
        return resp.json()


async def get_jwks(jwks_url: str, *, force_refresh: bool = False) -> Dict[str, Any]:
    """Return the platform JWKS document, using the TTL cache when fresh."""
    cached = _JWKS_CACHE.get(jwks_url)
    if cached and not force_refresh and cached[0] > _now():
        return cached[1]

    jwks = await _fetch_jwks(jwks_url)
    _JWKS_CACHE[jwks_url] = (_now() + _JWKS_TTL_SECONDS, jwks)
    return jwks


async def get_signing_key(jwks_url: str, kid: str) -> Optional[Dict[str, Any]]:
    """Return the JWK matching ``kid`` from the platform JWKS, or ``None``.

    If the key is not present in the cached document we refresh once — platforms
    rotate keys, and a launch signed with a freshly published key would
    otherwise fail until the TTL expired.
    """
    jwks = await get_jwks(jwks_url)
    key = _find_key(jwks, kid)
    if key is not None:
        return key

    jwks = await get_jwks(jwks_url, force_refresh=True)
    return _find_key(jwks, kid)


def _find_key(jwks: Dict[str, Any], kid: str) -> Optional[Dict[str, Any]]:
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


def clear_cache() -> None:
    """Drop all cached JWKS documents (used by tests)."""
    _JWKS_CACHE.clear()

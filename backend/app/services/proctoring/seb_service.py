"""Safe Exam Browser request-integrity enforcement (Epoch 11 §6, §9.2).

SEB attaches, on every request to the exam, a hash proving the request comes
from a SEB instance running a known configuration:

    X-SafeExamBrowser-ConfigKeyHash = SHA256(absoluteRequestURL + ConfigKey)
    X-SafeExamBrowser-RequestHash   = SHA256(absoluteRequestURL + BrowserExamKey)

OpenVision generates the .seb file, so it can compute the Config Key itself and
validate the first header without ever running SEB. Browser Exam Keys are
supported additively for admins who prefer to paste the key SEB shows them.

A request is valid iff the Config-Key hash OR any Browser-Exam-Key hash matches.
"""
import hashlib
import hmac
import ipaddress
from typing import Mapping, Optional

from app.core.config import settings
from app.schemas.proctoring import ProctoringConfig

CONFIG_KEY_HEADER = "X-SafeExamBrowser-ConfigKeyHash"
REQUEST_HASH_HEADER = "X-SafeExamBrowser-RequestHash"


def seb_hash(absolute_url: str, key: str) -> str:
    """SEB's per-request hash: SHA-256 of the absolute URL concatenated with the key."""
    return hashlib.sha256((absolute_url + key).encode("utf-8")).hexdigest()


def build_absolute_url(path: str, query: Optional[str] = None) -> str:
    """Reconstruct the browser-facing URL SEB hashed.

    Behind Nginx/TLS the app sees an internal URL, but SEB hashed the public one.
    We rebuild it from the configured public base (§6.4). A mismatch here breaks
    every hash, so the public base must exactly match what the .seb startURL used.
    """
    base = settings.PUBLIC_EXAM_URL_BASE.rstrip("/")
    url = f"{base}{path}"
    if query:
        url = f"{url}?{query}"
    return url


def verify_seb_request(
    *,
    absolute_url: str,
    policy: ProctoringConfig,
    headers: Mapping[str, str],
) -> bool:
    """Return True iff the request carries a valid SEB integrity hash.

    A test that does not require SEB is always a pass (transparent). Comparison
    is constant-time to avoid leaking the expected hash.
    """
    if not policy.require_seb:
        return True

    config_hash = headers.get(CONFIG_KEY_HEADER)
    request_hash = headers.get(REQUEST_HASH_HEADER)

    if policy.seb_config_key and config_hash:
        expected = seb_hash(absolute_url, policy.seb_config_key)
        if hmac.compare_digest(expected, config_hash.strip().lower()):
            return True

    if request_hash:
        for bek in policy.allowed_browser_exam_keys:
            expected = seb_hash(absolute_url, bek)
            if hmac.compare_digest(expected, request_hash.strip().lower()):
                return True

    return False


def has_any_seb_header(headers: Mapping[str, str]) -> bool:
    """True if the request carries at least one SEB header.

    Distinguishes "no SEB at all" (SEB_HEADER_MISSING) from "SEB present but the
    hash is wrong" (SEB_HASH_INVALID) for incident classification.
    """
    return bool(headers.get(CONFIG_KEY_HEADER) or headers.get(REQUEST_HASH_HEADER))


def ip_is_allowed(client_ip: Optional[str], allowlist: list[str]) -> bool:
    """True if the client IP is inside any allowlisted CIDR.

    An empty allowlist means "no IP restriction". An unparseable client IP fails
    closed when an allowlist is set.
    """
    if not allowlist:
        return True
    if not client_ip:
        return False
    try:
        addr = ipaddress.ip_address(client_ip)
    except ValueError:
        return False
    for entry in allowlist:
        try:
            if addr in ipaddress.ip_network(entry, strict=False):
                return True
        except ValueError:
            continue
    return False

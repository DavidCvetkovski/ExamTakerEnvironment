"""Pure-logic tests for Epoch 11 SEB integrity, IP allowlisting, policy, presence.

These exercise the security-critical functions with no DB/Redis dependency.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.schemas.proctoring import ClientProctoringView, ProctoringConfig
from app.services.proctoring import presence_service, seb_service
from app.services.proctoring.policy import resolve_proctoring_config


# --- SEB hash + verification ----------------------------------------------


def test_seb_hash_is_sha256_of_url_plus_key():
    # Known SHA-256 of "https://x/exama1b2" — recomputed to keep the test honest.
    import hashlib

    url, key = "https://x/exam", "a1b2"
    assert seb_service.seb_hash(url, key) == hashlib.sha256((url + key).encode()).hexdigest()


def test_require_seb_false_is_transparent_pass():
    policy = ProctoringConfig(require_seb=False)
    assert seb_service.verify_seb_request(absolute_url="https://x/exam", policy=policy, headers={}) is True


def test_valid_config_key_hash_passes():
    url = "https://exams.vu.nl/api/sessions/1/heartbeat"
    key = "deadbeef"
    policy = ProctoringConfig(require_seb=True, seb_config_key=key)
    headers = {seb_service.CONFIG_KEY_HEADER: seb_service.seb_hash(url, key)}
    assert seb_service.verify_seb_request(absolute_url=url, policy=policy, headers=headers) is True


def test_valid_browser_exam_key_hash_passes():
    url = "https://exams.vu.nl/api/sessions/1/heartbeat"
    bek = "cafef00d"
    policy = ProctoringConfig(require_seb=True, allowed_browser_exam_keys=[bek])
    headers = {seb_service.REQUEST_HASH_HEADER: seb_service.seb_hash(url, bek)}
    assert seb_service.verify_seb_request(absolute_url=url, policy=policy, headers=headers) is True


def test_missing_header_fails_when_seb_required():
    policy = ProctoringConfig(require_seb=True, seb_config_key="deadbeef")
    assert seb_service.verify_seb_request(absolute_url="https://x/exam", policy=policy, headers={}) is False


def test_wrong_hash_fails():
    url = "https://x/exam"
    policy = ProctoringConfig(require_seb=True, seb_config_key="deadbeef")
    headers = {seb_service.CONFIG_KEY_HEADER: "0" * 64}
    assert seb_service.verify_seb_request(absolute_url=url, policy=policy, headers=headers) is False


def test_url_mismatch_breaks_the_hash():
    # The same key but a different URL must not validate (binds hash to the URL).
    key = "deadbeef"
    policy = ProctoringConfig(require_seb=True, seb_config_key=key)
    headers = {seb_service.CONFIG_KEY_HEADER: seb_service.seb_hash("https://x/a", key)}
    assert seb_service.verify_seb_request(absolute_url="https://x/b", policy=policy, headers=headers) is False


def test_has_any_seb_header_distinguishes_missing_from_invalid():
    assert seb_service.has_any_seb_header({}) is False
    assert seb_service.has_any_seb_header({seb_service.CONFIG_KEY_HEADER: "x"}) is True


# --- IP allowlist ----------------------------------------------------------


def test_empty_allowlist_allows_everything():
    assert seb_service.ip_is_allowed("8.8.8.8", []) is True


def test_ip_inside_cidr_is_allowed():
    assert seb_service.ip_is_allowed("145.108.5.9", ["145.108.0.0/16"]) is True


def test_ip_outside_cidr_is_rejected():
    assert seb_service.ip_is_allowed("9.9.9.9", ["145.108.0.0/16"]) is False


def test_unparseable_ip_fails_closed_when_allowlist_set():
    assert seb_service.ip_is_allowed(None, ["145.108.0.0/16"]) is False
    assert seb_service.ip_is_allowed("not-an-ip", ["145.108.0.0/16"]) is False


# --- Policy resolution -----------------------------------------------------


def test_null_config_resolves_to_permissive_default():
    class _T:
        proctoring_config = None

    policy = resolve_proctoring_config(_T())
    assert policy.require_seb is False
    assert policy.ip_allowlist == []


def test_dict_config_is_parsed():
    class _T:
        proctoring_config = {"require_seb": True, "block_copy_paste": True}

    policy = resolve_proctoring_config(_T())
    assert policy.require_seb is True
    assert policy.block_copy_paste is True


def test_bad_cidr_is_rejected_on_write():
    with pytest.raises(ValueError):
        ProctoringConfig(ip_allowlist=["not-a-cidr"])


def test_client_view_omits_keys():
    policy = ProctoringConfig(require_seb=True, seb_config_key="deadbeef", allowed_browser_exam_keys=["abc"])
    view = ClientProctoringView.from_policy(policy)
    dumped = view.model_dump()
    assert "seb_config_key" not in dumped
    assert "allowed_browser_exam_keys" not in dumped
    assert dumped["require_seb"] is True


# --- Presence derivation ---------------------------------------------------


def test_presence_active_idle_disconnected():
    now = datetime.now(timezone.utc)
    assert presence_service.derive_presence(now - timedelta(seconds=5), now) == "ACTIVE"
    assert presence_service.derive_presence(now - timedelta(seconds=45), now) == "IDLE"
    assert presence_service.derive_presence(now - timedelta(seconds=120), now) == "DISCONNECTED"
    assert presence_service.derive_presence(None, now) == "DISCONNECTED"

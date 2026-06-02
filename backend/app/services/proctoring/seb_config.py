"""`.seb` configuration generation + Config Key derivation (Epoch 11 §6.3, §9.3).

⚠️ VERIFICATION GATE (directive §6.3): the Config Key algorithm below follows
SEB's documented approach (deterministic JSON serialization of the settings,
SHA-256), but it MUST be validated against a real Safe Exam Browser instance
before this is trusted in production. If parity cannot be achieved, ship
BEK-only mode (admin pastes the key SEB shows them) by leaving
``SEB_CONFIG_KEY_ENABLED`` false; the .seb file is still useful for launching SEB.
"""
import hashlib
import json
import plistlib
from typing import Any, Dict

from prisma import Json

from app.core.config import settings
from app.core.prisma_db import prisma
from app.schemas.proctoring import ProctoringConfig
from app.services.proctoring.policy import resolve_proctoring_config

# Keys excluded from the Config Key computation per the SEB specification.
_CONFIG_KEY_EXCLUDED = {"originatorVersion"}


def build_seb_settings(*, start_url: str, quit_url: str, policy: ProctoringConfig) -> Dict[str, Any]:
    """Build the SEB settings dictionary that becomes the .seb file.

    Mirrors the web-layer deterrents into SEB's native (and far stronger)
    lockdown so the two layers agree. Only non-secret exam configuration goes
    in here — never OpenVision secrets.
    """
    return {
        "startURL": start_url,
        "quitURL": quit_url,
        "sendBrowserExamKey": True,
        "allowQuit": True,
        "allowReload": True,
        "showReloadButton": True,
        "URLFilterEnable": True,
        "URLFilterEnableContentFilter": False,
        "allowSpellCheck": False,
        "allowDictation": False,
        "enableRightMouse": not policy.suppress_context_menu,
        "enableCopy": not policy.block_copy_paste,
        "enablePaste": not policy.block_copy_paste,
        "browserWindowAllowAddressBar": False,
        "allowBrowsingBackForward": True,
    }


def compute_config_key(settings_dict: Dict[str, Any]) -> str:
    """Deterministically derive the SEB Config Key from the settings.

    The settings are serialized to JSON with keys sorted case-insensitively and
    excluded keys removed, then SHA-256 hashed. See the verification-gate note at
    the top of this module — validate against a real SEB before trusting.
    """
    filtered = {k: v for k, v in settings_dict.items() if k not in _CONFIG_KEY_EXCLUDED}
    serialized = json.dumps(
        filtered,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def render_seb_plist(settings_dict: Dict[str, Any]) -> bytes:
    """Serialize settings into the XML-plist .seb format (unencrypted).

    SEB accepts unencrypted plist configs. Password/identity encryption is a
    documented later enhancement (directive §9.3).
    """
    return plistlib.dumps(settings_dict, fmt=plistlib.FMT_XML)


def _exam_start_url(scheduled_session_id: str) -> str:
    """Frontend URL SEB opens to begin the attempt for a scheduled session."""
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return f"{base}/my-exams?seb_session={scheduled_session_id}"


def _quit_url() -> str:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return f"{base}/my-exams"


async def generate_seb_file(scheduled_session_id: str, test_definition: Any) -> bytes:
    """Build the .seb file bytes for a scheduled session's test."""
    policy = resolve_proctoring_config(test_definition)
    settings_dict = build_seb_settings(
        start_url=_exam_start_url(scheduled_session_id),
        quit_url=_quit_url(),
        policy=policy,
    )
    return render_seb_plist(settings_dict)


async def regenerate_config_key_for_test(test_definition_id: str, scheduled_session_id: str) -> str | None:
    """(Re)compute and persist the Config Key for a test's proctoring policy.

    The ONLY writer of ``proctoring_config.seb_config_key`` (directive §8.1).
    Returns the new key, or None when Config-Key mode is disabled.
    """
    if not settings.SEB_CONFIG_KEY_ENABLED:
        return None

    test = await prisma.test_definitions.find_unique(where={"id": str(test_definition_id)})
    if not test:
        return None

    policy = resolve_proctoring_config(test)
    settings_dict = build_seb_settings(
        start_url=_exam_start_url(scheduled_session_id),
        quit_url=_quit_url(),
        policy=policy,
    )
    config_key = compute_config_key(settings_dict)

    raw = test.proctoring_config if isinstance(test.proctoring_config, dict) else {}
    raw = {**raw, "seb_config_key": config_key}
    await prisma.test_definitions.update(
        where={"id": str(test_definition_id)},
        data={"proctoring_config": Json(raw)},
    )
    return config_key

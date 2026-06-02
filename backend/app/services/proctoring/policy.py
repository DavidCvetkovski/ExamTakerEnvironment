"""Single source of truth for resolving a test's proctoring policy and the
proctor-authorization rule (Epoch 11 §9.1, §9.8)."""
from typing import Any

from fastapi import HTTPException, status

from app.models.user import UserRole
from app.schemas.proctoring import ProctoringConfig


def resolve_proctoring_config(test_definition: Any) -> ProctoringConfig:
    """Parse a test definition's ``proctoring_config`` JSONB into a validated policy.

    NULL / missing ⇒ the default (all-permissive) ``ProctoringConfig``. This is
    the ONLY place that interprets the raw column, so the "no proctoring" default
    is defined exactly once (CLAUDE.md §2 single-source rule).
    """
    raw = getattr(test_definition, "proctoring_config", None)
    if not raw:
        return ProctoringConfig()
    if isinstance(raw, ProctoringConfig):
        return raw
    if isinstance(raw, dict):
        return ProctoringConfig(**raw)
    return ProctoringConfig()


def assert_can_proctor(current_user: Any) -> None:
    """Authorize a staff user to supervise exams.

    Epoch 11 reuses the existing staff roles rather than adding a SUPERVISOR
    role (see directive §9.8). ADMIN and CONSTRUCTOR may proctor; everyone else
    is rejected. ``require_role`` already gates the endpoints — this is the
    defense-in-depth re-assertion at the service layer.
    """
    role = getattr(current_user, "role", None)
    if role not in (UserRole.ADMIN.value, UserRole.CONSTRUCTOR.value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Proctoring requires a staff account.",
        )

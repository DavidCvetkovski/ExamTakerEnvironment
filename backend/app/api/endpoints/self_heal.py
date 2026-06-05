"""Self-heal incident endpoints (Epoch 15).

Two surfaces:
  * ``POST /feedback`` — any authenticated user files a bug report. This is the
    deliberate human-in-the-loop input channel for the fix loop.
  * ``GET /self-heal/incidents`` — admin-only paginated feed of the backlog
    (runtime crashes + feedback), the read surface the loop and operators share.
"""
from fastapi import APIRouter, Depends, Query, Request, status

from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.self_heal import (
    FeedbackRequest,
    IncidentFeedResponse,
)
from app.services import self_heal_service

router = APIRouter(tags=["self-heal"])

_AdminDep = Depends(require_role(UserRole.ADMIN))


@router.post("/feedback", status_code=status.HTTP_202_ACCEPTED)
async def submit_feedback(
    payload: FeedbackRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Record a user bug report into the self-heal backlog.

    Returns ``202 Accepted`` — the report is queued for the fix loop, not acted
    on synchronously. Only the user's *role* is persisted, never their identity
    (§1).
    """
    await self_heal_service.record_feedback(
        message=payload.message,
        path=payload.path,
        user_role=current_user.role.value
        if hasattr(current_user.role, "value")
        else str(current_user.role),
        request_id=getattr(request.state, "request_id", None),
        context=payload.context,
    )
    return {"status": "accepted"}


@router.get("/self-heal/incidents", response_model=IncidentFeedResponse)
async def list_incidents(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    incident_status: str | None = Query(None, alias="status"),
    severity: str | None = Query(None),
    source: str | None = Query(None),
    current_user: User = _AdminDep,
) -> IncidentFeedResponse:
    """Admin-only paginated incident feed, most recently active first."""
    result = await self_heal_service.list_incidents(
        page=page,
        page_size=page_size,
        status=incident_status,
        severity=severity,
        source=source,
    )
    return IncidentFeedResponse(**result)

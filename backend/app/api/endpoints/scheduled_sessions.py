from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.dependencies import require_role
from app.models.user import User, UserRole
from app.schemas.scheduled_session import (
    ScheduledSessionCreate,
    ScheduledSessionResponse,
    ScheduledSessionUpdate,
)
from app.services.scheduled_sessions_service import (
    cancel_scheduled_session,
    create_scheduled_session,
    list_scheduled_sessions,
    update_scheduled_session,
)

router = APIRouter(prefix="/scheduled-sessions", tags=["scheduled-sessions"])


@router.post("/", response_model=ScheduledSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_scheduled_session_endpoint(
    payload: ScheduledSessionCreate,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Create a scheduled course exam session."""
    return await create_scheduled_session(payload, str(current_user.id))


@router.get("/", response_model=List[ScheduledSessionResponse])
async def list_scheduled_sessions_endpoint(
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """List scheduled course exam sessions."""
    return await list_scheduled_sessions()


@router.patch("/{session_id}", response_model=ScheduledSessionResponse)
async def update_scheduled_session_endpoint(
    session_id: UUID,
    payload: ScheduledSessionUpdate,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Update a scheduled session before it starts."""
    return await update_scheduled_session(session_id, payload)


@router.post("/{session_id}/cancel", response_model=ScheduledSessionResponse)
async def cancel_scheduled_session_endpoint(
    session_id: UUID,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Cancel a scheduled session."""
    return await cancel_scheduled_session(session_id)

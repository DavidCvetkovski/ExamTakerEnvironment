"""Endpoints for authenticated self-service account management."""

from fastapi import APIRouter, Depends, Response, status

from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import ConfirmPasswordRequest
from app.services import users_service as svc

router = APIRouter(prefix="/users/me", tags=["account"])


@router.post("/deactivate", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_account(
    payload: ConfirmPasswordRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
):
    """Deactivate the authenticated user's own account.

    Re-verifies the current password, bars admins (lockout guard), flips
    ``is_active`` to False, and invalidates all sessions. Reversible by an
    administrator — never a hard delete.
    """
    await svc.deactivate_self(
        user=current_user,
        current_password=payload.password,
        response=response,
    )

"""Endpoints for authenticated user preferences."""

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user
from app.schemas.preferences import (
    AccessibilityPreferences,
    AccessibilityPreferencesUpdate,
    DisplayNameResponse,
    DisplayNameUpdate,
    ThemePreferenceResponse,
    ThemePreferenceUpdate,
)
from app.services.preferences_service import (
    resolve_accessibility,
    update_accessibility_preferences,
    update_display_name,
    update_theme_preference,
)

router = APIRouter(prefix="/users/me/preferences", tags=["preferences"])


@router.patch("/theme", response_model=ThemePreferenceResponse)
async def patch_theme_preference(
    payload: ThemePreferenceUpdate,
    current_user=Depends(get_current_user),
):
    updated_user = await update_theme_preference(str(current_user.id), payload.theme)
    return ThemePreferenceResponse(theme=updated_user.theme_preference)


@router.patch("/profile", response_model=DisplayNameResponse)
async def patch_display_name(
    payload: DisplayNameUpdate,
    current_user=Depends(get_current_user),
):
    """Update the authenticated user's display name. A user can only change their
    own name — there is no id in the path; the actor is the subject."""
    updated_user = await update_display_name(str(current_user.id), payload.display_name)
    return DisplayNameResponse(display_name=updated_user.display_name)


@router.patch("/accessibility", response_model=AccessibilityPreferences)
async def patch_accessibility_preferences(
    payload: AccessibilityPreferencesUpdate,
    current_user=Depends(get_current_user),
):
    """Update the authenticated user's visual accessibility profile (partial)."""
    updated_user = await update_accessibility_preferences(str(current_user.id), payload)
    return resolve_accessibility(updated_user)

"""Endpoints for authenticated user preferences."""

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user
from app.schemas.preferences import (
    AccessibilityPreferences,
    AccessibilityPreferencesUpdate,
    ThemePreferenceResponse,
    ThemePreferenceUpdate,
)
from app.services.preferences_service import (
    resolve_accessibility,
    update_accessibility_preferences,
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


@router.patch("/accessibility", response_model=AccessibilityPreferences)
async def patch_accessibility_preferences(
    payload: AccessibilityPreferencesUpdate,
    current_user=Depends(get_current_user),
):
    """Update the authenticated user's visual accessibility profile (partial)."""
    updated_user = await update_accessibility_preferences(str(current_user.id), payload)
    return resolve_accessibility(updated_user)

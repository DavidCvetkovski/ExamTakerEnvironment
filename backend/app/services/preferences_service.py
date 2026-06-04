"""Persistence operations for user preferences."""

from app.core.prisma_db import prisma
from app.schemas.preferences import AccessibilityPreferences, AccessibilityPreferencesUpdate


async def update_theme_preference(user_id: str, theme: str | None):
    """Persist a user's theme preference and return the updated user record."""
    return await prisma.users.update(
        where={"id": user_id},
        data={"theme_preference": theme},
    )


async def update_display_name(user_id: str, display_name: str | None):
    """Persist a user's self-chosen display name (already trimmed/validated by the
    schema) and return the updated user record. ``None`` clears it."""
    return await prisma.users.update(
        where={"id": user_id},
        data={"display_name": display_name},
    )


def resolve_accessibility(user) -> AccessibilityPreferences:
    """Project a user record into its public accessibility profile. Single
    source of the field mapping (DB ``a11y_*`` columns → API names)."""
    return AccessibilityPreferences(
        high_contrast=user.a11y_high_contrast,
        dyslexia_font=user.a11y_dyslexia_font,
        text_scale=user.a11y_text_scale,
    )


async def update_accessibility_preferences(user_id: str, patch: AccessibilityPreferencesUpdate):
    """Apply only the provided accessibility fields and return the updated user.

    ``None`` means "leave unchanged"; for ``text_scale`` the literal ``"default"``
    clears the override back to the default size (stored as NULL).
    """
    data: dict = {}
    if patch.high_contrast is not None:
        data["a11y_high_contrast"] = patch.high_contrast
    if patch.dyslexia_font is not None:
        data["a11y_dyslexia_font"] = patch.dyslexia_font
    if patch.text_scale is not None:
        data["a11y_text_scale"] = None if patch.text_scale == "default" else patch.text_scale

    if not data:
        # No-op patch: return the current record unchanged rather than an empty write.
        return await prisma.users.find_unique(where={"id": user_id})

    return await prisma.users.update(where={"id": user_id}, data=data)

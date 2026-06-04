"""Schemas for user interface preferences."""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator


ThemeName = Literal["dark", "warm", "light-blue", "auto"]
TextScale = Literal["md", "lg", "xl"]

DISPLAY_NAME_MAX_LENGTH = 80


class DisplayNameUpdate(BaseModel):
    """Self-service display name. ``None`` or an empty/whitespace string clears it
    (the UI then falls back to the email local-part). Trimmed and length-bounded."""
    display_name: Optional[str] = None

    @field_validator("display_name")
    @classmethod
    def _normalize(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        if len(trimmed) > DISPLAY_NAME_MAX_LENGTH:
            raise ValueError(
                f"Display name must be at most {DISPLAY_NAME_MAX_LENGTH} characters."
            )
        return trimmed


class DisplayNameResponse(BaseModel):
    display_name: Optional[str] = None


class ThemePreferenceUpdate(BaseModel):
    theme: ThemeName | None


class ThemePreferenceResponse(BaseModel):
    theme: ThemeName | None


class AccessibilityPreferences(BaseModel):
    """Resolved visual-accessibility profile for a user. Orthogonal to theme."""
    high_contrast: bool = False
    dyslexia_font: bool = False
    text_scale: TextScale | None = None

    model_config = ConfigDict(from_attributes=True)


class AccessibilityPreferencesUpdate(BaseModel):
    """Partial update — a field left as ``None`` is unchanged. ``text_scale`` is
    cleared to default by sending the literal string ``"default"`` (None alone is
    ambiguous, so we treat None = no change and accept an explicit reset value)."""
    high_contrast: bool | None = None
    dyslexia_font: bool | None = None
    text_scale: TextScale | Literal["default"] | None = None

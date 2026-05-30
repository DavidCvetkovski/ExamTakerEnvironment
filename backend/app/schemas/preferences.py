"""Schemas for user interface preferences."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


ThemeName = Literal["dark", "warm", "light-blue", "auto"]
TextScale = Literal["md", "lg", "xl"]


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

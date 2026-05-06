"""Schemas for user interface preferences."""

from typing import Literal

from pydantic import BaseModel


ThemeName = Literal["dark", "warm", "light-blue"]


class ThemePreferenceUpdate(BaseModel):
    theme: ThemeName | None


class ThemePreferenceResponse(BaseModel):
    theme: ThemeName | None

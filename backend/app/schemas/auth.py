"""
Pydantic schemas for authentication and user management.
"""
from pydantic import BaseModel, EmailStr, Field, ConfigDict, model_validator
from typing import Optional
from uuid import UUID
from app.models.user import UserRole
from app.schemas.preferences import ThemeName, AccessibilityPreferences


# --- Requests ---

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, description="Minimum 8 characters")
    role: UserRole = UserRole.STUDENT
    vunet_id: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, description="Minimum 8 characters")


class ConfirmPasswordRequest(BaseModel):
    """Re-authentication payload for destructive self-service actions
    (sign out everywhere, deactivate account)."""
    password: str


# --- Responses ---

class UserPublic(BaseModel):
    """Public user profile — never exposes password hash."""
    id: UUID
    email: str
    role: UserRole
    vunet_id: Optional[str] = None
    is_active: bool = True
    theme_preference: ThemeName | None = None
    accessibility: AccessibilityPreferences = AccessibilityPreferences()
    # Administrator-granted accommodation (distinct from the self-chosen
    # accessibility preferences above). Forces a minimum enlarged layout on the
    # exam screen; resolved client-side via resolveExamTextScale(). See Epoch 10.
    accommodation_enlarged_display: bool = False

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def _nest_accessibility(cls, data):
        """Build the nested ``accessibility`` object from the ORM record's flat
        ``a11y_*`` columns. Runs for ORM objects (model_validate(user)); dicts
        pass through unchanged so explicit construction still works."""
        if isinstance(data, dict):
            return data
        return {
            "id": data.id,
            "email": data.email,
            "role": data.role,
            "vunet_id": getattr(data, "vunet_id", None),
            "is_active": getattr(data, "is_active", True),
            "theme_preference": getattr(data, "theme_preference", None),
            "accessibility": {
                "high_contrast": getattr(data, "a11y_high_contrast", False),
                "dyslexia_font": getattr(data, "a11y_dyslexia_font", False),
                "text_scale": getattr(data, "a11y_text_scale", None),
            },
            "accommodation_enlarged_display": getattr(
                data, "accommodation_enlarged_display", False
            ),
        }


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    user: UserPublic

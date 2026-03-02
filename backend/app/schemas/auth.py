"""
Pydantic schemas for authentication and user management.
"""
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional
from uuid import UUID
from app.models.user import UserRole


# --- Requests ---

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, description="Minimum 8 characters")
    role: UserRole = UserRole.STUDENT
    vunet_id: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# --- Responses ---

class UserPublic(BaseModel):
    """Public user profile — never exposes password hash."""
    id: UUID
    email: str
    role: UserRole
    vunet_id: Optional[str] = None
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    user: UserPublic

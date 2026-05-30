import enum
from sqlalchemy import Column, String, DateTime, Boolean, Enum, Float, Integer
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from app.core.database import Base


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    CONSTRUCTOR = "CONSTRUCTOR"
    REVIEWER = "REVIEWER"
    STUDENT = "STUDENT"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    vunet_id = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.STUDENT, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    provision_time_multiplier = Column(Float, default=1.0, nullable=False)
    theme_preference = Column(String, nullable=True, default=None)
    # Monotonic counter bumped on password change / sign-out-everywhere /
    # deactivation. Every JWT carries it; a mismatch invalidates the token.
    token_version = Column(Integer, default=0, nullable=False)
    # Self-service visual accessibility profile (orthogonal to theme_preference).
    a11y_high_contrast = Column(Boolean, default=False, nullable=False)
    a11y_dyslexia_font = Column(Boolean, default=False, nullable=False)
    a11y_text_scale = Column(String, nullable=True, default=None)  # 'md'|'lg'|'xl'
    # Administrator-granted accommodation (distinct from a self-chosen preference).
    accommodation_enlarged_display = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

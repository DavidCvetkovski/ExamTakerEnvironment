from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class CourseCreate(BaseModel):
    code: str = Field(min_length=2, max_length=32)
    title: str = Field(min_length=2, max_length=255)


class CourseResponse(BaseModel):
    id: UUID
    code: str
    title: str
    created_by: Optional[UUID] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class EnrollmentCreateRequest(BaseModel):
    student_id: Optional[UUID] = None
    student_email: Optional[EmailStr] = None


class EnrollmentResponse(BaseModel):
    id: UUID
    course_id: UUID
    student_id: UUID
    student_email: str
    is_active: bool
    enrolled_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CourseRosterResponse(BaseModel):
    enrollments: list[EnrollmentResponse]
    # Legacy aggregate flag (true when no edits are possible at all). Prefer the
    # granular flags below, which distinguish adding from removing.
    roster_locked: bool
    # Whether each operation is currently permitted. Adding is allowed while an
    # exam is ongoing (late joiners) but not once one has completed; removing is
    # blocked the moment an exam is ongoing or completed.
    can_enroll: bool
    can_remove: bool
    # "ONGOING" | "COMPLETED" | None — drives the explanatory banner copy.
    lock_reason: str | None = None


class StudentCandidateResponse(BaseModel):
    id: UUID
    email: str

    model_config = ConfigDict(from_attributes=True)

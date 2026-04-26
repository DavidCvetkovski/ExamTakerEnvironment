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


class StudentCandidateResponse(BaseModel):
    id: UUID
    email: str

    model_config = ConfigDict(from_attributes=True)

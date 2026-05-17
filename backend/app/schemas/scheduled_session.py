from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.scheduled_exam_session import CourseSessionStatus


class ScheduledSessionCreate(BaseModel):
    course_id: UUID
    test_definition_id: UUID
    starts_at: datetime
    duration_minutes_override: Optional[int] = Field(default=None, gt=0)


class ScheduledSessionUpdate(BaseModel):
    starts_at: Optional[datetime] = None
    duration_minutes_override: Optional[int] = Field(default=None, gt=0)


class ScheduledSessionResponse(BaseModel):
    id: UUID
    course_id: UUID
    course_code: str
    course_title: str
    test_definition_id: UUID
    test_title: str
    created_by: Optional[UUID] = None
    starts_at: datetime
    ends_at: datetime
    status: CourseSessionStatus
    duration_minutes_override: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class StudentScheduledSessionResponse(BaseModel):
    id: UUID
    course_id: UUID
    course_code: str
    course_title: str
    test_definition_id: UUID
    test_title: str
    starts_at: datetime
    ends_at: datetime
    status: CourseSessionStatus
    can_join: bool
    existing_attempt_id: Optional[UUID] = None
    existing_attempt_status: Optional[Literal["STARTED", "SUBMITTED", "EXPIRED"]] = None

    model_config = ConfigDict(from_attributes=True)


class ScheduledSessionListResponse(BaseModel):
    """Envelope for list endpoints. Includes server_now so the client can
    detect and correct for clock skew when deriving session lifecycle states.
    """

    sessions: List[ScheduledSessionResponse]
    server_now: datetime


class StudentScheduledSessionListResponse(BaseModel):
    """Student counterpart — same skew-correction contract."""

    sessions: List[StudentScheduledSessionResponse]
    server_now: datetime

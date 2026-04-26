"""Pydantic schemas for InteractionEvent heartbeat payloads."""
from pydantic import BaseModel, ConfigDict, field_validator
from uuid import UUID
from datetime import datetime
from typing import Optional, List, Dict, Any

from app.models.interaction_event import InteractionEventType


class InteractionEventCreate(BaseModel):
    """Schema for a single interaction event within a heartbeat batch."""
    learning_object_id: Optional[UUID] = None
    item_version_id: Optional[UUID] = None
    event_type: InteractionEventType
    payload: Dict[str, Any]


class InteractionEventBulkCreate(BaseModel):
    """Schema for a heartbeat request containing a batch of events."""
    events: List[InteractionEventCreate]

    @field_validator("events")
    @classmethod
    def max_batch_size(cls, v: List[InteractionEventCreate]) -> List[InteractionEventCreate]:
        if len(v) > 100:
            raise ValueError("Maximum 100 events per heartbeat request")
        if len(v) == 0:
            raise ValueError("At least one event is required")
        return v


class InteractionEventResponse(BaseModel):
    """Schema for returning a single persisted interaction event."""
    id: UUID
    session_id: UUID
    learning_object_id: Optional[UUID] = None
    item_version_id: Optional[UUID] = None
    event_type: InteractionEventType
    payload: Dict[str, Any]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HeartbeatResponse(BaseModel):
    """Response returned after a successful heartbeat flush."""
    saved: int
    server_timestamp: datetime


class AnswerState(BaseModel):
    """Reconstructed answer state for session recovery."""
    answers: Dict[str, Any]  # { learning_object_id: latest answer payload }
    flags: Dict[str, bool]   # { learning_object_id: flagged? }

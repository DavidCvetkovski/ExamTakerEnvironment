"""Pydantic DTOs for the Epoch 15 self-heal incident log.

Two write paths feed the store — the exception-capture middleware (server-side,
no DTO) and the ``/feedback`` endpoint (client-side, ``FeedbackRequest``). Reads
go through the admin-only paginated feed.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class FeedbackRequest(BaseModel):
    """A user-submitted bug report.

    Kept intentionally small: free-text plus an optional client-supplied path so
    the agent can correlate the report with the screen the user was on. The
    server never trusts ``path`` for anything but display/context.
    """

    message: str = Field(min_length=1, max_length=5000)
    path: Optional[str] = Field(default=None, max_length=512)
    context: Dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="ignore")


class IncidentResponse(BaseModel):
    """One incident row as surfaced to staff and (later) the fix loop."""

    id: UUID
    source: str
    severity: str
    status: str
    title: str
    message: str
    traceback: Optional[str] = None
    fingerprint: str
    occurrences: int
    request_method: Optional[str] = None
    request_path: Optional[str] = None
    request_id: Optional[str] = None
    user_role: Optional[str] = None
    context: Dict[str, Any] = Field(default_factory=dict)
    first_seen_at: datetime
    last_seen_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class IncidentFeedResponse(BaseModel):
    """Paginated incident feed (§4: every list endpoint paginates)."""

    items: List[IncidentResponse]
    total: int
    page: int
    page_size: int

"""Internal Pydantic schemas for events travelling through the heartbeat Redis Stream."""
from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel


class HeartbeatQueueEvent(BaseModel):
    """A validated interaction event accepted by the API and awaiting persistence.

    Instances are serialised to compact JSON and stored in the Redis Stream
    under the key ``event``.  All UUID fields are stored as strings so they
    can be round-tripped through Redis without import friction.
    """

    request_id: str
    session_id: str
    student_id: str
    client_event_id: str
    learning_object_id: Optional[str] = None
    item_version_id: Optional[str] = None
    event_type: str
    payload: Dict[str, Any]
    client_created_at: Optional[datetime] = None
    received_at: datetime

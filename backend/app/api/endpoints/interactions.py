"""API endpoints for interaction events (heartbeat) and answer state recovery."""
from fastapi import APIRouter, Depends
from uuid import UUID

from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.interaction_event import (
    InteractionEventBulkCreate,
    HeartbeatResponse,
    AnswerState,
)
from app.services.interactions_service import (
    save_interaction_events,
    get_latest_answers,
)

router = APIRouter()


@router.post("/{session_id}/heartbeat", response_model=HeartbeatResponse)
async def heartbeat(
    session_id: UUID,
    payload: InteractionEventBulkCreate,
    current_user: User = Depends(get_current_user),
):
    """
    Receive a batch of interaction events from the student's browser.

    Events are validated, ownership is verified, and all events are
    bulk-inserted into the database. Returns the count of saved events
    and the server timestamp for client-side sync.

    Returns 409 if the session is SUBMITTED or EXPIRED.
    """
    events_dicts = [
        {
            "learning_object_id": e.learning_object_id,
            "item_version_id": e.item_version_id,
            "event_type": e.event_type.value,
            "payload": e.payload,
        }
        for e in payload.events
    ]
    return await save_interaction_events(session_id, events_dicts, current_user)


@router.get("/{session_id}/answers", response_model=AnswerState)
async def get_answers(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
):
    """
    Reconstruct the latest answer and flag state for a session.

    Used for session recovery after browser crash, page refresh,
    or re-authentication. Returns the most recent answer payload
    per question and the latest flag state.
    """
    return await get_latest_answers(session_id, current_user)

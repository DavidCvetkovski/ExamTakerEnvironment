"""API endpoints for interaction events (heartbeat) and answer state recovery."""
import uuid as _uuid

from fastapi import APIRouter, Depends, Request
from uuid import UUID

from app.core.dependencies import get_current_user
from app.core.rate_limit import rate_limit_heartbeat
from app.models.user import User
from app.schemas.interaction_event import (
    InteractionEventBulkCreate,
    HeartbeatResponse,
    AnswerState,
)
from app.services.interactions_service import (
    accept_interaction_events,
    get_latest_answers,
)

router = APIRouter()


@router.post(
    "/{session_id}/heartbeat",
    response_model=HeartbeatResponse,
    dependencies=[Depends(rate_limit_heartbeat)],
)
async def heartbeat(
    session_id: UUID,
    payload: InteractionEventBulkCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Receive a batch of interaction events from the student's browser.

    Events are validated, ownership is verified, and all events are durably
    enqueued to the Redis Stream for asynchronous persistence by the
    heartbeat worker.  Returns immediately with an accepted count and the
    server timestamp for client-side sync.

    Returns 409 if the session is SUBMITTED or EXPIRED.
    """
    request_id: str = getattr(request.state, "request_id", str(_uuid.uuid4()))

    events_dicts = [
        {
            "client_event_id": e.client_event_id,
            "learning_object_id": e.learning_object_id,
            "item_version_id": e.item_version_id,
            "event_type": e.event_type.value,
            "payload": e.payload,
            "client_created_at": e.client_created_at,
        }
        for e in payload.events
    ]
    return await accept_interaction_events(
        session_id, events_dicts, current_user, request_id=request_id
    )


@router.get("/{session_id}/answers", response_model=AnswerState)
async def get_answers(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
):
    """Reconstruct the latest answer and flag state for a session.

    Used for session recovery after browser crash, page refresh,
    or re-authentication. Returns the most recent answer payload
    per question and the latest flag state.
    """
    return await get_latest_answers(session_id, current_user)

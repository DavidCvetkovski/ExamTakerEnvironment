"""API endpoints for interaction events (heartbeat) and answer state recovery."""
import uuid as _uuid

from fastapi import APIRouter, Depends, Request
from uuid import UUID

from app.core.dependencies import get_current_user, require_seb_integrity
from app.core.rate_limit import rate_limit_heartbeat, rate_limit_incident
from app.models.user import User
from app.schemas.interaction_event import (
    InteractionEventBulkCreate,
    HeartbeatResponse,
    AnswerState,
)
from app.schemas.proctoring import IncidentReport
from app.services.interactions_service import (
    accept_interaction_events,
    get_latest_answers,
    report_client_incident,
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
    current_user: User = Depends(require_seb_integrity),
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
    current_user: User = Depends(require_seb_integrity),
):
    """Reconstruct the latest answer and flag state for a session.

    Used for session recovery after browser crash, page refresh,
    or re-authentication. Returns the most recent answer payload
    per question and the latest flag state.
    """
    return await get_latest_answers(session_id, current_user)


@router.post(
    "/{session_id}/incidents",
    status_code=201,
    dependencies=[Depends(rate_limit_incident)],
)
async def report_incident(
    session_id: UUID,
    payload: IncidentReport,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Record a client-observed proctoring signal (focus loss, copy/paste, etc.).

    Trust boundary: the body type is a constrained enum and the severity is
    assigned server-side — the client can never assert a server-authoritative
    incident. Ownership is enforced; the event is tagged ``source=CLIENT``.
    """
    await report_client_incident(session_id, payload, current_user, request)
    return {"recorded": True}

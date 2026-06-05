"""Supervisor monitor, per-attempt interventions, and .seb config download (Epoch 11).

Two audiences, two prefixes:
  - ``/scheduled-sessions/{id}/...`` — supervising a whole exam window.
  - ``/exam-sessions/{id}/...``      — acting on one student's attempt.

All staff-gated (CONSTRUCTOR/ADMIN) with a defense-in-depth ``assert_can_proctor``.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.core.dependencies import require_role
from app.models.user import User, UserRole
from app.schemas.proctoring import (
    IncidentFeedResponse,
    MonitorResponse,
)
from app.services.exam_sessions_service import serialize_exam_session
from app.services.proctoring import intervention_service, monitor_service, seb_config
from app.services.proctoring.policy import assert_can_proctor
from app.services.scheduled_sessions_service import get_scheduled_session_or_404

router = APIRouter(tags=["proctoring"])

_StaffDep = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN))


# --- Supervisor monitor (scheduled-session scoped) -------------------------


@router.get("/scheduled-sessions/{scheduled_id}/monitor", response_model=MonitorResponse)
async def monitor(
    scheduled_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = _StaffDep,
):
    """Live roster of attempts for a scheduled session (presence + incident counts)."""
    assert_can_proctor(current_user)
    return await monitor_service.build_monitor(scheduled_id, page, page_size)


@router.get("/scheduled-sessions/{scheduled_id}/incidents", response_model=IncidentFeedResponse)
async def incidents(
    scheduled_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    severity: str | None = Query(None),
    incident_type: str | None = Query(None),
    exam_session_id: UUID | None = Query(None),
    current_user: User = _StaffDep,
):
    """Paginated, filterable incident feed for a scheduled session.

    ``exam_session_id`` scopes the feed to one student's attempt.
    """
    assert_can_proctor(current_user)
    return await monitor_service.list_incidents(
        scheduled_id, page, page_size, severity, incident_type, exam_session_id
    )


@router.get("/scheduled-sessions/{scheduled_id}/incidents/export")
async def export_incidents(scheduled_id: UUID, current_user: User = _StaffDep):
    """Download the full incident log for a scheduled session as a CSV file.

    Most useful after a session closes (the durable proctoring record), but
    available at any time. Staff-gated; read-only (Epoch 14.7)."""
    assert_can_proctor(current_user)
    # Validate existence so a bad id is a 404, not an empty file.
    await get_scheduled_session_or_404(str(scheduled_id))
    csv_text = await monitor_service.export_incidents_csv(scheduled_id)
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="proctoring-log-{scheduled_id}.csv"'
        },
    )


@router.get("/scheduled-sessions/{scheduled_id}/seb-config")
async def staff_seb_config(scheduled_id: UUID, current_user: User = _StaffDep):
    """Download the .seb config file for distribution to lab machines / the LMS."""
    assert_can_proctor(current_user)
    scheduled = await get_scheduled_session_or_404(str(scheduled_id))
    data = await seb_config.generate_seb_file(str(scheduled_id), scheduled.test_definitions)
    return Response(
        content=data,
        media_type="application/seb",
        headers={"Content-Disposition": f'attachment; filename="exam-{scheduled_id}.seb"'},
    )


# --- Per-attempt interventions (exam-session scoped) -----------------------


@router.post("/exam-sessions/{session_id}/terminate")
async def terminate(session_id: UUID, current_user: User = _StaffDep):
    assert_can_proctor(current_user)
    updated = await intervention_service.terminate_attempt(session_id, str(current_user.id))
    return serialize_exam_session(updated)

"""Append-only proctoring incident log (Epoch 11 §9.7).

Modeled on ``integration_audit_service.record_integration_audit``: one creator,
PII-light, no update/delete. All incident creation in the codebase routes through
``record_incident`` so the "CRITICAL flags the attempt" rule lives in one place.
"""
import logging
from typing import Any, Dict, Optional

from prisma import Json

from app.core.prisma_db import prisma
from app.models.proctoring_incident import (
    ProctoringIncidentSource,
    ProctoringIncidentType,
    ProctoringSeverity,
)

logger = logging.getLogger(__name__)

# Severity is assigned by the SERVER, never by the client. Client-reportable
# behavioral signals map here; server-authored types pass their own severity.
_CLIENT_SEVERITY: Dict[str, ProctoringSeverity] = {
    ProctoringIncidentType.FOCUS_LOST.value: ProctoringSeverity.WARNING,
    ProctoringIncidentType.COPY_ATTEMPT.value: ProctoringSeverity.WARNING,
    ProctoringIncidentType.PASTE_ATTEMPT.value: ProctoringSeverity.WARNING,
    ProctoringIncidentType.CONTEXT_MENU_ATTEMPT.value: ProctoringSeverity.WARNING,
    ProctoringIncidentType.FULLSCREEN_EXIT.value: ProctoringSeverity.WARNING,
}


def client_severity_for(incident_type: str) -> ProctoringSeverity:
    """Server-side severity for a client-reported incident type (never trusted from the client)."""
    return _CLIENT_SEVERITY.get(incident_type, ProctoringSeverity.INFO)


async def record_incident(
    *,
    incident_type: ProctoringIncidentType | str,
    severity: ProctoringSeverity | str,
    source: ProctoringIncidentSource | str,
    exam_session_id: Optional[str] = None,
    scheduled_session_id: Optional[str] = None,
    student_id: Optional[str] = None,
    client_ip: Optional[str] = None,
    detail: Optional[Dict[str, Any]] = None,
) -> None:
    """Append a proctoring incident.

    ``detail`` must be PII-light: counts, route, reason codes, hashes — never
    answer contents, raw fingerprints, tokens, or SEB header values. A CRITICAL
    incident also sets ``exam_sessions.flagged_for_review = true``.
    """
    type_value = incident_type.value if isinstance(incident_type, ProctoringIncidentType) else incident_type
    severity_value = severity.value if isinstance(severity, ProctoringSeverity) else severity
    source_value = source.value if isinstance(source, ProctoringIncidentSource) else source

    await prisma.proctoring_incidents.create(
        data={
            "exam_session_id": exam_session_id,
            "scheduled_session_id": scheduled_session_id,
            "student_id": student_id,
            "incident_type": type_value,
            "severity": severity_value,
            "source": source_value,
            "detail": Json(detail or {}),
            "client_ip": client_ip,
        }
    )

    if severity_value == ProctoringSeverity.CRITICAL.value and exam_session_id:
        try:
            await prisma.exam_sessions.update(
                where={"id": exam_session_id},
                data={"flagged_for_review": True},
            )
        except Exception as exc:  # flagging must not break the request path
            logger.warning("Failed to flag session %s for review: %s", exam_session_id, exc)

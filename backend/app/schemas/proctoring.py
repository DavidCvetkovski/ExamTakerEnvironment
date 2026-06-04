"""Pydantic DTOs for Epoch 11 proctoring (policy, monitor, interventions, incidents)."""
import enum
import ipaddress
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Policy (persisted as test_definitions.proctoring_config)
# ---------------------------------------------------------------------------


class ProctoringConfig(BaseModel):
    """Per-test proctoring policy.

    Every field defaults to the permissive (no-proctoring) value, so a NULL /
    missing column means "ordinary, unproctored test" — preserving every legacy
    blueprint without a migration.
    """

    require_seb: bool = False
    # Server-derived hex SHA-256 of the .seb settings. Never set by a client;
    # only seb_config.regenerate_for_test writes it.
    seb_config_key: Optional[str] = None
    allowed_browser_exam_keys: List[str] = Field(default_factory=list)

    block_copy_paste: bool = False
    suppress_context_menu: bool = False
    detect_focus_loss: bool = True
    require_fullscreen: bool = False

    ip_allowlist: List[str] = Field(default_factory=list)  # CIDR strings
    detect_session_sharing: bool = False

    model_config = ConfigDict(extra="ignore")

    @field_validator("ip_allowlist")
    @classmethod
    def _validate_cidrs(cls, value: List[str]) -> List[str]:
        for entry in value:
            ipaddress.ip_network(entry, strict=False)  # raises ValueError on garbage
        return value

    @field_validator("allowed_browser_exam_keys")
    @classmethod
    def _validate_bek_hex(cls, value: List[str]) -> List[str]:
        for item in value:
            int(item, 16)  # hex sanity
        return value

    @field_validator("seb_config_key")
    @classmethod
    def _validate_ck_hex(cls, value: Optional[str]) -> Optional[str]:
        if value:
            int(value, 16)
        return value


# ---------------------------------------------------------------------------
# Monitor
# ---------------------------------------------------------------------------


class MonitorAttemptRow(BaseModel):
    exam_session_id: UUID
    student_id: UUID
    student_email: str
    student_name: Optional[str] = None
    status: str
    current_question_index: Optional[int] = None
    current_question_label: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    presence: str  # ACTIVE | IDLE | DISCONNECTED
    flagged_for_review: bool = False
    incident_count: int = 0


class MonitorResponse(BaseModel):
    scheduled_session_id: UUID
    server_now: datetime
    total: int
    page: int
    page_size: int
    attempts: List[MonitorAttemptRow]
    course_code: Optional[str] = None
    course_title: Optional[str] = None
    test_title: Optional[str] = None
    ends_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Incidents
# ---------------------------------------------------------------------------


class ClientReportableIncidentType(str, enum.Enum):
    """The strict subset of incident types a client may report.

    A client can never assert a server-authoritative type (SEB_HASH_INVALID,
    any SUPERVISOR_* action). This is the §1 "never trust client input" rule
    made structural.
    """

    FOCUS_LOST = "FOCUS_LOST"
    COPY_ATTEMPT = "COPY_ATTEMPT"
    PASTE_ATTEMPT = "PASTE_ATTEMPT"
    CONTEXT_MENU_ATTEMPT = "CONTEXT_MENU_ATTEMPT"
    FULLSCREEN_EXIT = "FULLSCREEN_EXIT"


class IncidentReport(BaseModel):
    incident_type: ClientReportableIncidentType
    detail: Dict[str, Any] = Field(default_factory=dict)


class IncidentRow(BaseModel):
    id: UUID
    incident_type: str
    severity: str
    source: str
    detail: Dict[str, Any]
    created_at: datetime
    student_id: Optional[UUID] = None
    student_email: Optional[str] = None
    exam_session_id: Optional[UUID] = None


class IncidentFeedResponse(BaseModel):
    server_now: datetime
    total: int
    page: int
    page_size: int
    incidents: List[IncidentRow]


class FingerprintPayload(BaseModel):
    """Optional device fingerprint sent by the client at join time."""

    fingerprint: str = Field(min_length=8, max_length=128)


class ClientProctoringView(BaseModel):
    """The secret-free slice of the policy the exam client needs to drive its UX.

    Deliberately omits seb_config_key and allowed_browser_exam_keys — the client
    never needs the keys (the server validates), and exposing them would defeat
    the control.
    """

    require_seb: bool = False
    block_copy_paste: bool = False
    suppress_context_menu: bool = False
    detect_focus_loss: bool = True
    require_fullscreen: bool = False
    detect_session_sharing: bool = False

    @classmethod
    def from_policy(cls, policy: "ProctoringConfig") -> "ClientProctoringView":
        return cls(
            require_seb=policy.require_seb,
            block_copy_paste=policy.block_copy_paste,
            suppress_context_menu=policy.suppress_context_menu,
            detect_focus_loss=policy.detect_focus_loss,
            require_fullscreen=policy.require_fullscreen,
            detect_session_sharing=policy.detect_session_sharing,
        )

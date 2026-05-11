"""Unit tests for blueprint_status_service classification logic.

We test the pure `_classify` helper directly with synthetic session records.
The full DB-backed pathway is covered by integration tests in
test_scheduled_sessions.py and test_test_matrix.py.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import pytest

from app.models.blueprint_status import BlueprintStatus
from app.services.blueprint_status_service import (
    _classify,
    can_delete_blueprint,
    can_edit_blueprint,
    mutation_error_message,
)


@dataclass
class _Session:
    """Minimal duck-type matching the prisma scheduled_exam_session shape."""
    status: str
    starts_at: datetime
    ends_at: datetime


pytestmark = pytest.mark.anyio

NOW = datetime.now(timezone.utc)


def _future():
    return _Session("SCHEDULED", NOW + timedelta(hours=2), NOW + timedelta(hours=3))


def _ongoing():
    # Stored status may still be SCHEDULED; derivation should detect it's currently active.
    return _Session("SCHEDULED", NOW - timedelta(minutes=10), NOW + timedelta(hours=1))


def _closed():
    return _Session("CLOSED", NOW - timedelta(days=2), NOW - timedelta(days=1))


def _canceled():
    return _Session("CANCELED", NOW - timedelta(days=2), NOW - timedelta(days=1))


async def test_no_sessions_is_new():
    assert _classify([]) == BlueprintStatus.NEW


async def test_only_future_session_is_scheduled():
    assert _classify([_future()]) == BlueprintStatus.SCHEDULED


async def test_active_session_is_ongoing():
    assert _classify([_ongoing()]) == BlueprintStatus.ONGOING


async def test_closed_session_is_passed():
    assert _classify([_closed()]) == BlueprintStatus.PASSED


async def test_canceled_session_is_passed():
    assert _classify([_canceled()]) == BlueprintStatus.PASSED


async def test_priority_ongoing_beats_passed():
    assert _classify([_closed(), _ongoing()]) == BlueprintStatus.ONGOING


async def test_priority_passed_beats_scheduled():
    assert _classify([_future(), _closed()]) == BlueprintStatus.PASSED


async def test_priority_ongoing_beats_everything():
    assert _classify([_future(), _closed(), _ongoing(), _canceled()]) == BlueprintStatus.ONGOING


async def test_edit_permission():
    assert can_edit_blueprint(BlueprintStatus.NEW) is True
    assert can_edit_blueprint(BlueprintStatus.SCHEDULED) is True
    assert can_edit_blueprint(BlueprintStatus.ONGOING) is False
    assert can_edit_blueprint(BlueprintStatus.PASSED) is False


async def test_delete_permission():
    assert can_delete_blueprint(BlueprintStatus.NEW) is True
    assert can_delete_blueprint(BlueprintStatus.SCHEDULED) is False
    assert can_delete_blueprint(BlueprintStatus.ONGOING) is False
    assert can_delete_blueprint(BlueprintStatus.PASSED) is False


async def test_mutation_error_messages():
    assert mutation_error_message(BlueprintStatus.NEW) == ""
    assert mutation_error_message(BlueprintStatus.SCHEDULED) == ""
    assert "active" in mutation_error_message(BlueprintStatus.ONGOING).lower()
    assert "completed" in mutation_error_message(BlueprintStatus.PASSED).lower()

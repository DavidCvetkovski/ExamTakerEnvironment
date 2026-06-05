from datetime import datetime, timedelta, timezone
import json
import random
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from prisma import Json

from app.core.cache import (
    TTL_TEST_DEFINITION,
    cache_delete,
    cache_get,
    cache_set,
    test_definition_key,
)
from app.core.prisma_db import prisma
from app.models.exam_session import ExamSessionMode, SessionStatus
from app.models.item_version import ItemStatus
from app.models.scheduled_exam_session import CourseSessionStatus
from app.models.user import UserRole
from app.core.time_utils import ensure_utc
from app.services.scheduled_sessions_service import (
    ensure_scheduled_session_current,
)


def _try_get_redis() -> Optional[Any]:
    """Return the Redis client, or ``None`` if it was never initialized.

    Lets the cache-aware paths degrade gracefully (straight to Postgres) in
    unit tests and any context where ``connect_redis`` did not run.
    """
    try:
        from app.core.redis import get_redis

        return get_redis()
    except RuntimeError:
        return None


async def invalidate_test_definition_cache(test_definition_id: str) -> None:
    """Drop the cached candidate pool for a test definition.

    Call after any mutation that changes which item versions a blueprint would
    resolve to: editing the test definition's blocks, or creating/updating/
    reviewing item versions it can draw from.
    """
    redis = _try_get_redis()
    if redis is not None:
        await cache_delete(redis, test_definition_key(str(test_definition_id)))


async def invalidate_all_test_definition_pools() -> None:
    """Drop every cached candidate pool.

    Item versions are selected by tag across the whole bank, so a change to any
    item version can alter the pool of an arbitrary set of blueprints. Rather
    than track that dynamic mapping, item-version writes clear all pools; the
    set is small and writes are far rarer than exam-join reads.
    """
    from app.core.cache import cache_delete_pattern

    redis = _try_get_redis()
    if redis is not None:
        await cache_delete_pattern(redis, "test_definition:*:snapshot:v1")

def get_return_path(session_mode: str) -> str:
    """Map an exam session mode to the route the client should return to."""
    if session_mode == ExamSessionMode.ASSIGNED.value:
        return "/my-exams"
    return "/blueprint"


def serialize_exam_session(session: Any) -> Dict[str, Any]:
    """Convert a Prisma record into the response shape expected by the API."""
    payload = dict(session.__dict__)
    payload["return_path"] = get_return_path(payload["session_mode"])
    return payload


def parse_test_blocks(raw_blocks: Any) -> List[Dict[str, Any]]:
    """Decode stored blueprint JSON into a Python list."""
    if isinstance(raw_blocks, str):
        return json.loads(raw_blocks)
    return raw_blocks or []


def parse_json_field(raw_value: Any) -> Any:
    """Decode persisted JSON that may already be parsed."""
    if isinstance(raw_value, str):
        try:
            return json.loads(raw_value)
        except json.JSONDecodeError:
            return {}
    return raw_value


def metadata_has_tags(metadata: Any, tags: List[str]) -> bool:
    """Check whether the item metadata satisfies at least one requested tag."""
    if not tags:
        return True
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except json.JSONDecodeError:
            metadata = {}
    if not isinstance(metadata, dict):
        return False
    return any(tag in metadata for tag in tags)


def build_item_snapshot(item_version: Any) -> Dict[str, Any]:
    """Freeze the latest item version into the session snapshot shape."""
    return {
        "learning_object_id": str(item_version.learning_object_id),
        "item_version_id": str(item_version.id),
        "content": item_version.content,
        "options": item_version.options,
        "question_type": item_version.question_type,
        "version_number": item_version.version_number,
    }


def maybe_shuffle_snapshot_options(snapshot: Dict[str, Any], shuffle_options: bool) -> Dict[str, Any]:
    """Randomize objective-question option order inside the frozen snapshot when enabled."""
    if not shuffle_options:
        return snapshot

    if snapshot.get("question_type") not in {"MULTIPLE_CHOICE", "MULTIPLE_RESPONSE"}:
        return snapshot

    options = parse_json_field(snapshot.get("options"))
    if isinstance(options, dict) and isinstance(options.get("choices"), list):
        shuffled = {**options, "choices": list(options["choices"])}
        random.shuffle(shuffled["choices"])
        return {**snapshot, "options": shuffled}

    if isinstance(options, list):
        shuffled = list(options)
        random.shuffle(shuffled)
        return {**snapshot, "options": shuffled}

    return snapshot


_SELECTABLE_STATUSES = [
    ItemStatus.APPROVED.value,
    ItemStatus.READY_FOR_REVIEW.value,
    ItemStatus.DRAFT.value,
]


async def _resolve_item_pool(test_definition: Any) -> List[Dict[str, Any]]:
    """Resolve blueprint rules into a deterministic, cacheable candidate pool.

    This performs the DB-heavy work (one query per rule) and returns one entry
    per rule, each holding *unshuffled* item snapshots:

    - ``{"kind": "fixed", "snapshot": {...}}``
    - ``{"kind": "random", "count": N, "candidates": [{...}, ...]}``

    Per-session randomness — ``random.sample`` for random rules and option
    shuffling — is applied later by ``select_items_for_test_definition`` so this
    structure is identical for every student and therefore safe to cache.
    """
    pool: List[Dict[str, Any]] = []
    blocks = parse_test_blocks(test_definition.blocks)

    for block in blocks:
        for rule in block["rules"]:
            if rule["rule_type"] == "FIXED":
                learning_object_id = str(rule["learning_object_id"])
                latest_item = await prisma.item_versions.find_first(
                    where={
                        "learning_object_id": learning_object_id,
                        "status": {"in": _SELECTABLE_STATUSES},
                    },
                    order={"version_number": "desc"},
                )
                if not latest_item:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Fixed rule failed: LO {learning_object_id} has no available version.",
                    )
                pool.append({"kind": "fixed", "snapshot": build_item_snapshot(latest_item)})
                continue

            tags = rule.get("tags", [])
            count = rule.get("count", 1)
            candidates_all = await prisma.item_versions.find_many(
                where={"status": {"in": _SELECTABLE_STATUSES}},
                order={"version_number": "desc"},
            )

            candidates_by_learning_object: Dict[str, Any] = {}
            for candidate in candidates_all:
                learning_object_id = str(candidate.learning_object_id)
                if learning_object_id in candidates_by_learning_object:
                    continue
                if metadata_has_tags(candidate.metadata_tags, tags):
                    candidates_by_learning_object[learning_object_id] = candidate

            candidates = list(candidates_by_learning_object.values())
            if len(candidates) < count:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Random rule failed: "
                        f"Found {len(candidates)} available items, but need {count}."
                    ),
                )

            pool.append(
                {
                    "kind": "random",
                    "count": count,
                    "candidates": [build_item_snapshot(c) for c in candidates],
                }
            )

    return pool


async def get_item_pool(test_definition: Any) -> List[Dict[str, Any]]:
    """Return the resolved candidate pool, reading through a Redis cache.

    Redis is never the source of truth: a miss (or any Redis error) falls back
    to ``_resolve_item_pool`` against Postgres. The pool is invalidated when the
    underlying test definition or its item versions change (see
    ``invalidate_test_definition_cache``); a 5-minute TTL bounds staleness if an
    invalidation is ever missed.
    """
    redis = _try_get_redis()
    key = test_definition_key(str(test_definition.id))

    if redis is not None:
        cached = await cache_get(redis, key)
        if cached is not None:
            return cached

    pool = await _resolve_item_pool(test_definition)

    if redis is not None:
        await cache_set(redis, key, pool, ttl=TTL_TEST_DEFINITION)

    return pool


async def select_items_for_test_definition(test_definition: Any) -> List[Dict[str, Any]]:
    """Resolve blueprint rules into the frozen list of exam items for one attempt.

    Reads the deterministic candidate pool (cached) then applies the per-session
    random choices: sampling for random rules and option shuffling.
    """
    scoring_config = parse_json_field(getattr(test_definition, "scoring_config", None)) or {}
    shuffle_options = bool(scoring_config.get("shuffle_options", False))

    pool = await get_item_pool(test_definition)
    selected_items: List[Dict[str, Any]] = []

    for entry in pool:
        if entry["kind"] == "fixed":
            selected_items.append(
                maybe_shuffle_snapshot_options(entry["snapshot"], shuffle_options)
            )
        else:
            for chosen in random.sample(entry["candidates"], entry["count"]):
                selected_items.append(
                    maybe_shuffle_snapshot_options(chosen, shuffle_options)
                )

    return selected_items


async def create_exam_session_record(
    *,
    test_definition: Any,
    student_id: str,
    selected_items: List[Dict[str, Any]],
    duration_minutes: int,
    session_mode: ExamSessionMode,
    scheduled_session_id: Optional[str] = None,
    expires_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Persist a frozen exam attempt and return the serialized payload."""
    resolved_expires_at = ensure_utc(expires_at) if expires_at else datetime.now(timezone.utc) + timedelta(minutes=duration_minutes)
    session = await prisma.exam_sessions.create(
        data={
            "test_definition_id": str(test_definition.id),
            "student_id": student_id,
            "scheduled_session_id": scheduled_session_id,
            "items": Json(selected_items),
            "status": SessionStatus.STARTED.value,
            "session_mode": session_mode.value,
            "started_at": datetime.now(timezone.utc),
            "expires_at": resolved_expires_at,
        }
    )
    return serialize_exam_session(session)


async def instantiate_practice_session(
    test_definition_id: UUID,
    current_user: Any,
) -> Dict[str, Any]:
    """
    Create a practice attempt directly from a blueprint for staff users.
    """
    if current_user.role not in [UserRole.ADMIN.value, UserRole.CONSTRUCTOR.value]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Students cannot create ad-hoc practice sessions.",
        )

    test_definition = await prisma.test_definitions.find_unique(
        where={"id": str(test_definition_id)}
    )
    if not test_definition:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test definition not found.",
        )

    selected_items = await select_items_for_test_definition(test_definition)
    multiplier = getattr(current_user, "provision_time_multiplier", 1.0) or 1.0
    duration_minutes = max(1, int(test_definition.duration_minutes * multiplier))

    return await create_exam_session_record(
        test_definition=test_definition,
        student_id=str(current_user.id),
        selected_items=selected_items,
        duration_minutes=duration_minutes,
        session_mode=ExamSessionMode.PRACTICE,
    )


async def instantiate_session_for_student(
    test_definition_id: UUID,
    current_user: Any,
) -> Dict[str, Any]:
    """
    Compatibility wrapper for the legacy endpoint. Staff can still create practice attempts,
    while students must use the scheduled-session join flow.
    """
    return await instantiate_practice_session(test_definition_id, current_user)


async def _hash_fingerprint(raw: str) -> str:
    """One-way, salted hash of a client fingerprint (Epoch 11 §9.9).

    Stored values are not reversible and not correlatable across exams.
    """
    import hashlib

    from app.core.config import settings

    return hashlib.sha256(f"{settings.FINGERPRINT_SALT}:{raw}".encode("utf-8")).hexdigest()


async def _apply_device_fingerprint(attempt: Any, raw_fingerprint: str, scheduled: Any) -> None:
    """Record/compare the device fingerprint, raising a sharing incident on mismatch."""
    from app.services.proctoring.policy import resolve_proctoring_config

    policy = resolve_proctoring_config(getattr(scheduled, "test_definitions", None))
    hashed = await _hash_fingerprint(raw_fingerprint)
    existing = getattr(attempt, "device_fingerprint", None)

    if not existing:
        await prisma.exam_sessions.update(
            where={"id": attempt.id}, data={"device_fingerprint": hashed}
        )
        return

    if policy.detect_session_sharing and existing != hashed:
        from app.models.proctoring_incident import (
            ProctoringIncidentSource,
            ProctoringIncidentType,
            ProctoringSeverity,
        )
        from app.services.proctoring.incident_service import record_incident

        await record_incident(
            incident_type=ProctoringIncidentType.DEVICE_FINGERPRINT_MISMATCH,
            severity=ProctoringSeverity.CRITICAL,
            source=ProctoringIncidentSource.SERVER,
            exam_session_id=str(attempt.id),
            scheduled_session_id=str(scheduled.id),
            student_id=str(attempt.student_id),
            detail={"reason": "device_changed"},
        )


async def join_scheduled_session_for_student(
    scheduled_session_id: UUID,
    current_user: Any,
    device_fingerprint: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Join a scheduled exam session. Reuses an existing attempt when present.
    """
    if current_user.role != UserRole.STUDENT.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can join assigned exam sessions.",
        )

    scheduled = await prisma.scheduled_exam_sessions.find_unique(
        where={"id": str(scheduled_session_id)},
        include={"courses": True, "test_definitions": True},
    )
    if not scheduled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scheduled session not found.",
        )

    scheduled = await ensure_scheduled_session_current(scheduled)
    if scheduled.status == CourseSessionStatus.CANCELED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This scheduled session has been canceled.",
        )

    enrollment = await prisma.course_enrollments.find_first(
        where={
            "course_id": str(scheduled.course_id),
            "student_id": str(current_user.id),
            "is_active": True,
        }
    )
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not enrolled in the course for this exam session.",
        )

    if scheduled.status != CourseSessionStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This exam session is not currently joinable.",
        )

    existing_attempt = await prisma.exam_sessions.find_first(
        where={
            "scheduled_session_id": str(scheduled_session_id),
            "student_id": str(current_user.id),
        },
        order={"started_at": "desc"},
    )
    if existing_attempt:
        if device_fingerprint:
            await _apply_device_fingerprint(existing_attempt, device_fingerprint, scheduled)
        return serialize_exam_session(existing_attempt)

    selected_items = await select_items_for_test_definition(scheduled.test_definitions)
    multiplier = getattr(current_user, "provision_time_multiplier", 1.0) or 1.0
    base_minutes = scheduled.duration_minutes_override or scheduled.test_definitions.duration_minutes
    duration_minutes = max(1, int(base_minutes * multiplier))

    # The student's window is `duration_minutes * multiplier` from the
    # moment they join, capped at `scheduled.ends_at` so they cannot run
    # past the scheduled close. Before this fix, expires_at was hardcoded
    # to scheduled.ends_at and the carefully-computed multiplier was dead
    # code — every student got the same window regardless of their
    # accommodation. See test_time_multiplier_application.
    now = datetime.now(timezone.utc)
    individual_expiry = now + timedelta(minutes=duration_minutes)
    expires_at = min(individual_expiry, ensure_utc(scheduled.ends_at))

    created = await create_exam_session_record(
        test_definition=scheduled.test_definitions,
        student_id=str(current_user.id),
        selected_items=selected_items,
        duration_minutes=duration_minutes,
        session_mode=ExamSessionMode.ASSIGNED,
        scheduled_session_id=str(scheduled.id),
        expires_at=expires_at,
    )

    # C-1: if the scheduled window closes before the student's entitled expiry,
    # their accommodation could not be fully honoured. Record an incident so the
    # supervisor is aware — the student is silently short-changed otherwise.
    if individual_expiry > ensure_utc(scheduled.ends_at):
        granted_minutes = max(
            0, int((ensure_utc(scheduled.ends_at) - now).total_seconds() // 60)
        )
        from app.models.proctoring_incident import (
            ProctoringIncidentSource,
            ProctoringIncidentType,
            ProctoringSeverity,
        )
        from app.services.proctoring.incident_service import record_incident

        await record_incident(
            incident_type=ProctoringIncidentType.ACCOMMODATION_CLIPPED,
            severity=ProctoringSeverity.WARNING,
            source=ProctoringIncidentSource.SERVER,
            exam_session_id=str(created["id"]),
            scheduled_session_id=str(scheduled.id),
            student_id=str(current_user.id),
            detail={
                "entitled_minutes": duration_minutes,
                "granted_minutes": granted_minutes,
                "clipped_minutes": duration_minutes - granted_minutes,
                "multiplier": multiplier,
            },
        )

    if device_fingerprint:
        hashed = await _hash_fingerprint(device_fingerprint)
        await prisma.exam_sessions.update(
            where={"id": str(created["id"])}, data={"device_fingerprint": hashed}
        )
    return created


async def finalize_timed_out_session(session: Any) -> Any:
    """Auto-submit and grade a STARTED session whose window has elapsed.

    Running out of time is treated as an automatic submission: the attempt is
    marked SUBMITTED, stamped with ``submitted_at``, and auto-graded so the
    student gets a result and the run counts like any other submission. Without
    this, timed-out attempts were marked EXPIRED and silently never graded.
    Grading failure must not block returning the session.
    """
    now = datetime.now(timezone.utc)
    updated = await prisma.exam_sessions.update(
        where={"id": session.id},
        data={
            "status": SessionStatus.SUBMITTED.value,
            "submitted_at": session.submitted_at or now,
        },
    )
    try:
        from app.services.grading_service import auto_grade_session
        await auto_grade_session(session.id)
    except Exception:
        pass
    return updated


async def get_exam_session_for_user(
    session_id: UUID,
    current_user: Any,
) -> Dict[str, Any]:
    """
    Retrieve an exam attempt while enforcing ownership and automatic expiry.
    """
    session = await prisma.exam_sessions.find_unique(where={"id": str(session_id)})
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam session not found.",
        )

    if session.status == SessionStatus.STARTED.value:
        now = datetime.now(timezone.utc)
        expires_at = ensure_utc(session.expires_at)
        if now > expires_at:
            session = await finalize_timed_out_session(session)

    if session.student_id != current_user.id and current_user.role not in [
        UserRole.ADMIN.value,
        UserRole.CONSTRUCTOR.value,
    ]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this session.",
        )

    payload = serialize_exam_session(session)
    payload["proctoring"] = await _client_proctoring_view(session.test_definition_id)
    return payload


async def _client_proctoring_view(test_definition_id: str):
    """Resolve the secret-free proctoring policy slice for the exam client."""
    from app.schemas.proctoring import ClientProctoringView
    from app.services.proctoring.policy import resolve_proctoring_config

    test = await prisma.test_definitions.find_unique(where={"id": str(test_definition_id)})
    return ClientProctoringView.from_policy(resolve_proctoring_config(test)).model_dump()

from datetime import datetime, timedelta, timezone
import random
from typing import List
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import cast, func
from sqlalchemy.dialects.postgresql import ARRAY, TEXT

from app.models.user import User
from app.models.test_definition import TestDefinition
from app.models.exam_session import ExamSession, SessionStatus
from app.models.item_version import ItemVersion, ItemStatus


def _select_items_for_test_definition(db: Session, test: TestDefinition) -> List[dict]:
    """
    Core selection / freeze logic.

    Given a TestDefinition, return a list of item snapshot dicts:
    {
        "learning_object_id": str,
        "item_version_id": str,
        "content": dict,
        "options": dict,
        "question_type": str,
        "version_number": int,
    }
    """
    selected_items: List[dict] = []

    for block in test.blocks:
        for rule in block["rules"]:
            if rule["rule_type"] == "FIXED":
                lo_id = rule["learning_object_id"]
                latest_approved = (
                    db.query(ItemVersion)
                    .filter(
                        ItemVersion.learning_object_id == lo_id,
                        ItemVersion.status == ItemStatus.APPROVED,
                    )
                    .order_by(ItemVersion.version_number.desc())
                    .first()
                )
                if not latest_approved:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Fixed rule failed: LO {lo_id} has no approved version.",
                    )

                selected_items.append(
                    {
                        "learning_object_id": str(latest_approved.learning_object_id),
                        "item_version_id": str(latest_approved.id),
                        "content": latest_approved.content,
                        "options": latest_approved.options,
                        "question_type": latest_approved.question_type.value,
                        "version_number": latest_approved.version_number,
                    }
                )

            elif rule["rule_type"] == "RANDOM":
                tags = rule.get("tags", [])
                count = rule.get("count", 1)

                query = db.query(ItemVersion).filter(
                    ItemVersion.status == ItemStatus.APPROVED
                )
                if tags:
                    query = query.filter(
                        ItemVersion.metadata_tags.op("?|")(cast(tags, ARRAY(TEXT)))
                    )

                subquery = (
                    db.query(
                        ItemVersion.learning_object_id,
                        func.max(ItemVersion.version_number).label("max_v"),
                    )
                    .filter(ItemVersion.status == ItemStatus.APPROVED)
                    .group_by(ItemVersion.learning_object_id)
                    .subquery()
                )

                candidates: List[ItemVersion] = (
                    query.join(
                        subquery,
                        (
                            ItemVersion.learning_object_id
                            == subquery.c.learning_object_id
                        )
                        & (ItemVersion.version_number == subquery.c.max_v),
                    ).all()
                )

                if len(candidates) < count:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            "Random rule failed: "
                            f"Found {len(candidates)} approved items, but need {count}."
                        ),
                    )

                chosen = random.sample(candidates, count)
                for v in chosen:
                    selected_items.append(
                        {
                            "learning_object_id": str(v.learning_object_id),
                            "item_version_id": str(v.id),
                            "content": v.content,
                            "options": v.options,
                            "question_type": v.question_type.value,
                            "version_number": v.version_number,
                        }
                    )

    return selected_items


def instantiate_session_for_student(
    db: Session, test_definition_id: UUID, current_user: User
) -> ExamSession:
    """
    Instantiate (freeze) a TestDefinition for the given student user.
    """
    test = (
        db.query(TestDefinition)
        .filter(TestDefinition.id == test_definition_id)
        .first()
    )
    if not test:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test definition not found.",
        )

    selected_items = _select_items_for_test_definition(db, test)

    total_minutes = test.duration_minutes * current_user.provision_time_multiplier
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=total_minutes)

    new_session = ExamSession(
        test_definition_id=test.id,
        student_id=current_user.id,
        items=selected_items,
        status=SessionStatus.STARTED,
        expires_at=expires_at,
    )

    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session


def get_exam_session_for_user(
    db: Session, session_id: UUID, current_user: User
) -> ExamSession:
    """
    Retrieve an ExamSession for the given user, applying expiration and
    authorization rules.
    """
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exam session not found.",
        )

    if (
        session.status == SessionStatus.STARTED
        and datetime.now(timezone.utc).replace(tzinfo=None) > session.expires_at.replace(tzinfo=None)
    ):
        session.status = SessionStatus.EXPIRED
        db.commit()
        db.refresh(session)

    if session.student_id != current_user.id and current_user.role not in [
        "ADMIN",
        "CONSTRUCTOR",
    ]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this session.",
        )

    return session


from typing import List, Dict, Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import cast
from sqlalchemy.dialects.postgresql import ARRAY, TEXT

from app.models.user import User, UserRole
from app.models.test_definition import TestDefinition
from app.models.item_version import ItemVersion, ItemStatus
from app.schemas.test_definition import TestDefinitionCreate


def create_test_definition(
    db: Session, payload: TestDefinitionCreate, current_user: User
) -> TestDefinition:
    blocks_data = [block.model_dump(mode="json") for block in payload.blocks]

    new_test = TestDefinition(
        title=payload.title,
        description=payload.description,
        created_by=current_user.id,
        blocks=blocks_data,
        duration_minutes=payload.duration_minutes,
        shuffle_questions=payload.shuffle_questions,
    )
    db.add(new_test)
    db.commit()
    db.refresh(new_test)
    return new_test


def list_test_definitions(db: Session, current_user: User) -> List[TestDefinition]:
    # For now, all roles see all tests; RBAC can tighten this later if needed.
    return db.query(TestDefinition).all()


def get_test_definition(db: Session, test_id: UUID, current_user: User) -> TestDefinition:
    test = db.query(TestDefinition).filter(TestDefinition.id == test_id).first()
    if not test:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test definition not found.",
        )
    return test


def update_test_definition(
    db: Session, test_id: UUID, payload: TestDefinitionCreate, current_user: User
) -> TestDefinition:
    test = db.query(TestDefinition).filter(TestDefinition.id == test_id).first()
    if not test:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test definition not found.",
        )

    test.title = payload.title
    test.description = payload.description
    test.blocks = [block.model_dump(mode="json") for block in payload.blocks]
    test.duration_minutes = payload.duration_minutes
    test.shuffle_questions = payload.shuffle_questions

    db.commit()
    db.refresh(test)
    return test


def validate_test_blueprint(db: Session, test_id: UUID, current_user: User) -> Dict[str, Any]:
    """
    Dry-run selection rules against the DB.
    Ensures that enough APPROVED items exist for each RANDOM rule.

    Returns the same shape as the original endpoint:
    {
        "valid": bool,
        "blocks": [
            {
                "title": str,
                "rule_validation": [
                    {
                        "rule": str,
                        "valid": bool,
                        "matching_count"?: int,
                        "reason": str
                    },
                    ...
                ]
            },
            ...
        ]
    }
    """
    test = db.query(TestDefinition).filter(TestDefinition.id == test_id).first()
    if not test:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Test definition not found.",
        )

    results = []
    for block in test.blocks:
        block_results = {"title": block["title"], "rule_validation": []}
        for rule in block["rules"]:
            if rule["rule_type"] == "FIXED":
                lo_id = rule["learning_object_id"]
                latest = (
                    db.query(ItemVersion)
                    .filter(
                        ItemVersion.learning_object_id == lo_id,
                        ItemVersion.status == ItemStatus.APPROVED,
                    )
                    .first()
                )
                block_results["rule_validation"].append(
                    {
                        "rule": f"FIXED {lo_id}",
                        "valid": latest is not None,
                        "reason": "Found approved version"
                        if latest
                        else "No approved version found",
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

                matching_count = query.distinct(ItemVersion.learning_object_id).count()
                block_results["rule_validation"].append(
                    {
                        "rule": f"RANDOM tags={tags} count={count}",
                        "valid": matching_count >= count,
                        "matching_count": matching_count,
                        "reason": f"Found {matching_count} candidates",
                    }
                )
        results.append(block_results)

    all_valid = all(
        all(rv["valid"] for rv in b["rule_validation"]) for b in results
    )
    return {"valid": all_valid, "blocks": results}


from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import cast
from sqlalchemy.dialects.postgresql import ARRAY, TEXT
from uuid import UUID
from typing import List

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.test_definition import TestDefinition
from app.models.item_version import ItemVersion, ItemStatus
from app.schemas.test_definition import TestDefinitionCreate, TestDefinitionResponse

router = APIRouter()

@router.post("/", response_model=TestDefinitionResponse, status_code=status.HTTP_201_CREATED)
def create_test_definition(
    payload: TestDefinitionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Create a new Test Blueprint with blocks and rules."""
    # Convert Pydantic model to dict for JSONB field, ensuring UUIDs/enums are serialized to strings
    blocks_data = [block.model_dump(mode='json') for block in payload.blocks]
    
    new_test = TestDefinition(
        title=payload.title,
        description=payload.description,
        created_by=current_user.id,
        blocks=blocks_data,
        duration_minutes=payload.duration_minutes,
        shuffle_questions=payload.shuffle_questions
    )
    db.add(new_test)
    db.commit()
    db.refresh(new_test)
    return new_test

@router.get("/", response_model=List[TestDefinitionResponse])
def list_test_definitions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all available test blueprints."""
    return db.query(TestDefinition).all()

@router.get("/{test_id}", response_model=TestDefinitionResponse)
def get_test_definition(
    test_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch details of a specific test blueprint."""
    test = db.query(TestDefinition).filter(TestDefinition.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test definition not found.")
    return test

@router.put("/{test_id}", response_model=TestDefinitionResponse)
def update_test_definition(
    test_id: UUID,
    payload: TestDefinitionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Update an existing test blueprint."""
    test = db.query(TestDefinition).filter(TestDefinition.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test definition not found.")
    
    test.title = payload.title
    test.description = payload.description
    test.blocks = [block.model_dump(mode='json') for block in payload.blocks]
    test.duration_minutes = payload.duration_minutes
    test.shuffle_questions = payload.shuffle_questions
    
    db.commit()
    db.refresh(test)
    return test

@router.post("/{test_id}/validate")
def validate_test_blueprint(
    test_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Dry-run selection rules against the DB.
    Ensures that enough APPROVED items exist for each RANDOM rule.
    """
    test = db.query(TestDefinition).filter(TestDefinition.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test definition not found.")
    
    results = []
    for block in test.blocks:
        block_results = {"title": block["title"], "rule_validation": []}
        for rule in block["rules"]:
            if rule["rule_type"] == "FIXED":
                lo_id = rule["learning_object_id"]
                # Check for at least one APPROVED version
                latest = db.query(ItemVersion).filter(
                    ItemVersion.learning_object_id == lo_id,
                    ItemVersion.status == ItemStatus.APPROVED
                ).first()
                block_results["rule_validation"].append({
                    "rule": f"FIXED {lo_id}",
                    "valid": latest is not None,
                    "reason": "Found approved version" if latest else "No approved version found"
                })
            elif rule["rule_type"] == "RANDOM":
                tags = rule.get("tags", [])
                count = rule.get("count", 1)
                
                # Query matching items with at least one approved version
                query = db.query(ItemVersion).filter(ItemVersion.status == ItemStatus.APPROVED)
                if tags:
                    # Cast tags list to PostgreSQL text array for the ?| operator
                    query = query.filter(ItemVersion.metadata_tags.op('?|')(cast(tags, ARRAY(TEXT))))
                
                matching_count = query.distinct(ItemVersion.learning_object_id).count()
                block_results["rule_validation"].append({
                    "rule": f"RANDOM tags={tags} count={count}",
                    "valid": matching_count >= count,
                    "matching_count": matching_count,
                    "reason": f"Found {matching_count} candidates"
                })
        results.append(block_results)
        
    return {"valid": all(all(rv["valid"] for rv in b["rule_validation"]) for b in results), "blocks": results}

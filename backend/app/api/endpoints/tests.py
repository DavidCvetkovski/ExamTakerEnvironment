from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.test_definition import TestDefinitionCreate, TestDefinitionResponse
from app.services.blueprints_service import (
    create_test_definition as svc_create_test_definition,
    list_test_definitions as svc_list_test_definitions,
    get_test_definition as svc_get_test_definition,
    update_test_definition as svc_update_test_definition,
    validate_test_blueprint as svc_validate_test_blueprint,
)

router = APIRouter()

@router.post("/", response_model=TestDefinitionResponse, status_code=status.HTTP_201_CREATED)
def create_test_definition(
    payload: TestDefinitionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Create a new Test Blueprint with blocks and rules."""
    return svc_create_test_definition(db=db, payload=payload, current_user=current_user)

@router.get("/", response_model=List[TestDefinitionResponse])
def list_test_definitions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all available test blueprints."""
    return svc_list_test_definitions(db=db, current_user=current_user)

@router.get("/{test_id}", response_model=TestDefinitionResponse)
def get_test_definition(
    test_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch details of a specific test blueprint."""
    return svc_get_test_definition(db=db, test_id=test_id, current_user=current_user)

@router.put("/{test_id}", response_model=TestDefinitionResponse)
def update_test_definition(
    test_id: UUID,
    payload: TestDefinitionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Update an existing test blueprint."""
    return svc_update_test_definition(
        db=db,
        test_id=test_id,
        payload=payload,
        current_user=current_user,
    )

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
    return svc_validate_test_blueprint(
        db=db,
        test_id=test_id,
        current_user=current_user,
    )

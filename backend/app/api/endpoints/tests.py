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
async def create_test_definition(
    payload: TestDefinitionCreate,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Create a new Test Blueprint with blocks and rules."""
    return await svc_create_test_definition(payload=payload, current_user_id=current_user.id)

@router.get("/", response_model=List[TestDefinitionResponse])
async def list_test_definitions(
    current_user: User = Depends(get_current_user),
):
    """List all available test blueprints."""
    return await svc_list_test_definitions()

@router.get("/{test_id}", response_model=TestDefinitionResponse)
async def get_test_definition(
    test_id: UUID,
    current_user: User = Depends(get_current_user),
):
    """Fetch details of a specific test blueprint."""
    return await svc_get_test_definition(test_id=test_id)

@router.put("/{test_id}", response_model=TestDefinitionResponse)
async def update_test_definition(
    test_id: UUID,
    payload: TestDefinitionCreate,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Update an existing test blueprint."""
    return await svc_update_test_definition(
        test_id=test_id,
        payload=payload,
    )

@router.post("/{test_id}/validate")
async def validate_test_blueprint(
    test_id: UUID,
    current_user: User = Depends(get_current_user),
):
    """
    Dry-run selection rules against the DB.
    Ensures that enough APPROVED items exist for each RANDOM rule.
    """
    return await svc_validate_test_blueprint(
        test_id=test_id,
    )

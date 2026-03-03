from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import cast, func
from sqlalchemy.dialects.postgresql import ARRAY, TEXT
from uuid import UUID
from datetime import datetime, timedelta
import random
from typing import List

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.test_definition import TestDefinition
from app.models.exam_session import ExamSession, SessionStatus
from app.models.item_version import ItemVersion, ItemStatus
from app.schemas.exam_session import ExamSessionCreate, ExamSessionResponse

router = APIRouter()

@router.post("/", response_model=ExamSessionResponse, status_code=status.HTTP_201_CREATED)
def instantiate_session(
    payload: ExamSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Instantiate (Freeze) a Test Blueprint into a specific student session.
    """
    test = db.query(TestDefinition).filter(TestDefinition.id == payload.test_definition_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test definition not found.")

    selected_items = []
    
    for block in test.blocks:
        for rule in block["rules"]:
            if rule["rule_type"] == "FIXED":
                lo_id = rule["learning_object_id"]
                # Get latest APPROVED version
                v = db.query(ItemVersion).filter(
                    ItemVersion.learning_object_id == lo_id,
                    ItemVersion.status == ItemStatus.APPROVED
                ).order_by(ItemVersion.version_number.desc()).first()
                
                if not v:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Fixed rule failed: LO {lo_id} has no approved version."
                    )
                
                selected_items.append({
                    "learning_object_id": str(v.learning_object_id),
                    "item_version_id": str(v.id),
                    "content": v.content,
                    "options": v.options,
                    "question_type": v.question_type.value,
                    "version_number": v.version_number
                })
                
            elif rule["rule_type"] == "RANDOM":
                tags = rule.get("tags", [])
                count = rule.get("count", 1)
                
                # Query all candidates that have at least one approved version
                # To simplify and ensure we don't pick the same LO twice in one random rule:
                # We select the latest Approved version for each LO that matches tags.
                query = db.query(ItemVersion).filter(ItemVersion.status == ItemStatus.APPROVED)
                if tags:
                    query = query.filter(ItemVersion.metadata_tags.op('?|')(cast(tags, ARRAY(TEXT))))
                
                # Filter to only the latest version per LO
                subquery = db.query(
                    ItemVersion.learning_object_id,
                    func.max(ItemVersion.version_number).label("max_v")
                ).filter(ItemVersion.status == ItemStatus.APPROVED).group_by(ItemVersion.learning_object_id).subquery()
                
                candidates = query.join(
                    subquery, 
                    (ItemVersion.learning_object_id == subquery.c.learning_object_id) & 
                    (ItemVersion.version_number == subquery.c.max_v)
                ).all()
                
                if len(candidates) < count:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Random rule failed: Found {len(candidates)} approved items, but need {count}."
                    )
                
                chosen = random.sample(candidates, count)
                for v in chosen:
                    selected_items.append({
                        "learning_object_id": str(v.learning_object_id),
                        "item_version_id": str(v.id),
                        "content": v.content,
                        "options": v.options,
                        "question_type": v.question_type.value,
                        "version_number": v.version_number
                    })

    # Calculate expiration
    expires_at = datetime.utcnow() + timedelta(minutes=test.duration_minutes)

    new_session = ExamSession(
        test_definition_id=test.id,
        student_id=current_user.id,
        items=selected_items,
        status=SessionStatus.STARTED,
        expires_at=expires_at
    )
    
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session

@router.get("/{session_id}", response_model=ExamSessionResponse)
def get_exam_session(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve the frozen exam session."""
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found.")
    
    # Simple multi-tenancy check: only the student or an admin/constructor can view it
    if session.student_id != current_user.id and current_user.role not in ["ADMIN", "CONSTRUCTOR"]:
        raise HTTPException(status_code=403, detail="Not authorized to view this session.")
        
    return session

import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.core.database import Base, get_db
from app.models.item_version import ItemStatus, QuestionType
from app.models.learning_object import LearningObject
from app.models.user import User
from app.models.item_bank import ItemBank
import uuid

# Use the real local Postgres DB for Pytest so JSONB works
POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "password")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "openvision")
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")

SQLALCHEMY_DATABASE_URL = f"postgresql+psycopg://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# We drop and recreate tables for isolation. 
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

@pytest.fixture(scope="module")
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    # Setup base entities
    user = User(email="test@vu.nl")
    db.add(user)
    db.commit()
    
    bank = ItemBank(name="Test Bank", created_by=user.id)
    db.add(bank)
    db.commit()
    
    lo = LearningObject(bank_id=bank.id, created_by=user.id)
    db.add(lo)
    db.commit()
    db.refresh(lo)
    
    yield {"lo_id": str(lo.id), "user_id": str(user.id)}
    
    db.close()

def test_immutability_version_up_logic(setup_db):
    """
    Simulates the strict Version-Up timeline logic defined in the blueprint.
    """
    lo_id = setup_db["lo_id"]
    
    # 1. User Creates Draft 1
    payload_draft_1 = {
        "learning_object_id": lo_id,
        "status": ItemStatus.DRAFT,
        "question_type": QuestionType.ESSAY,
        "content": {"raw": "Draft 1"},
        "options": {
            "question_type": QuestionType.ESSAY,
            "min_words": 100,
            "max_words": 200
        }
    }
    
    resp1 = client.post(f"/api/learning-objects/{lo_id}/versions", json=payload_draft_1)
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["version_number"] == 1
    assert data1["status"] == "DRAFT"
    
    # 2. User Edits Draft 1 (Hits Save Again)
    # The Immutability Controller should OVERWRITE row 1, because it sits at DRAFT status.
    payload_draft_1["content"]["raw"] = "Draft 1 Edited"
    resp2 = client.post(f"/api/learning-objects/{lo_id}/versions", json=payload_draft_1)
    assert resp2.status_code == 200
    data2 = resp2.json()
    
    assert data2["version_number"] == 1 # Still version 1! No version bloat!
    assert data2["content"]["raw"] == "Draft 1 Edited"
    
    # 3. Simulate Reviewer Approving the Question
    # In a real app we'd have a PATCH transition endpoint. For testing, we mock the DB state changing.
    db = TestingSessionLocal()
    from app.models.item_version import ItemVersion
    active_version = db.query(ItemVersion).filter_by(id=data2["id"]).first()
    active_version.status = ItemStatus.APPROVED
    db.commit()
    db.close()
    
    # 4. User Notices a Typo and Edits the Approved Question
    # The Immutability Controller MUST NOT overwrite row 1. It must create Version 2.
    payload_draft_new = {
        "learning_object_id": lo_id,
        "status": ItemStatus.DRAFT,
        "question_type": QuestionType.ESSAY,
        "content": {"raw": "Draft 1 Edited - Fixed Typo"},
        "options": {
            "question_type": QuestionType.ESSAY,
            "min_words": 100,
            "max_words": 200
        }
    }
    
    resp3 = client.post(f"/api/learning-objects/{lo_id}/versions", json=payload_draft_new)
    assert resp3.status_code == 200
    data3 = resp3.json()
    
    # BOOM. The safety guard worked.
    assert data3["version_number"] == 2
    assert data3["status"] == "DRAFT"
    
    # Verify the timeline query gets both
    history_resp = client.get(f"/api/learning-objects/{lo_id}/versions")
    history = history_resp.json()
    assert len(history) == 2
    assert history[0]["version_number"] == 2  # Order desc
    assert history[1]["version_number"] == 1
    assert history[1]["status"] == "APPROVED"

def test_cascading_soft_delete(setup_db):
    """
    Tests the DELETE endpoint transforms to a RETIRED status.
    """
    lo_id = setup_db["lo_id"]
    
    resp = client.delete(f"/api/learning-objects/{lo_id}")
    assert resp.status_code == 200
    
    # Verify versions are retired
    history_resp = client.get(f"/api/learning-objects/{lo_id}/versions")
    history = history_resp.json()
    for entry in history:
        assert entry["status"] == "RETIRED"

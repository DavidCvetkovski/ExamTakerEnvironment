import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.core.database import Base, get_db
from app.models.item_version import ItemStatus, QuestionType
from app.models.learning_object import LearningObject
from app.models.user import User, UserRole
from app.models.item_bank import ItemBank
from app.core.security import hash_password
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

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

PROF_EMAIL = "prof_test@vu.nl"
PROF_PASS = "profpass123"

def login(email: str, password: str) -> str:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]

def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    # Setup base entities
    user = User(
        email=PROF_EMAIL, 
        hashed_password=hash_password(PROF_PASS),
        role=UserRole.CONSTRUCTOR
    )
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
    token = login(PROF_EMAIL, PROF_PASS)
    headers = auth(token)
    
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
    
    resp1 = client.post(f"/api/learning-objects/{lo_id}/versions", json=payload_draft_1, headers=headers)
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["version_number"] == 1
    assert data1["status"] == "DRAFT"
    
    # 2. User Edits Draft 1 (Hits Save Again)
    # The Immutability Controller should OVERWRITE row 1, because it sits at DRAFT status.
    payload_draft_1["content"]["raw"] = "Draft 1 Edited"
    resp2 = client.post(f"/api/learning-objects/{lo_id}/versions", json=payload_draft_1, headers=headers)
    assert resp2.status_code == 200
    data2 = resp2.json()
    
    assert data2["version_number"] == 1 # Still version 1! No version bloat!
    assert data2["content"]["raw"] == "Draft 1 Edited"
    
    # 3. Simulate Reviewer Approving the Question
    # In a real app we'd have a PATCH transition endpoint. Using the new API endpoint for it.
    client.patch(f"/api/learning-objects/{lo_id}/versions/{data2['id']}/status", 
                 json={"new_status": "READY_FOR_REVIEW"}, headers=headers)
    
    # Needs a reviewer to approve
    db = TestingSessionLocal()
    reviewer = User(email="reviewer_items@vu.nl", hashed_password=hash_password("pass"), role=UserRole.REVIEWER)
    db.add(reviewer)
    db.commit()
    db.close()
    
    reviewer_token = login("reviewer_items@vu.nl", "pass")
    
    client.patch(f"/api/learning-objects/{lo_id}/versions/{data2['id']}/status", 
                 json={"new_status": "APPROVED"}, headers=auth(reviewer_token))
    
    # 4. Constructor Notices a Typo and Edits the Approved Question
    # The Immutability Controller MUST NOT overwrite row 1. It must create Version 2.
    payload_draft_new = {
        "learning_object_id": lo_id,
        "status": ItemStatus.DRAFT, # Initial save of new version is always draft
        "question_type": QuestionType.ESSAY,
        "content": {"raw": "Draft 1 Edited - Fixed Typo"},
        "options": {
            "question_type": QuestionType.ESSAY,
            "min_words": 100,
            "max_words": 200
        }
    }
    
    resp3 = client.post(f"/api/learning-objects/{lo_id}/versions", json=payload_draft_new, headers=headers)
    assert resp3.status_code == 200
    data3 = resp3.json()
    
    # BOOM. The safety guard worked.
    assert data3["version_number"] == 2
    assert data3["status"] == "DRAFT"
    
    # Verify the timeline query gets both
    history_resp = client.get(f"/api/learning-objects/{lo_id}/versions", headers=headers)
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
    token = login(PROF_EMAIL, PROF_PASS)
    headers = auth(token)
    
    resp = client.delete(f"/api/learning-objects/{lo_id}", headers=headers)
    assert resp.status_code == 200
    
    # Verify versions are retired
    history_resp = client.get(f"/api/learning-objects/{lo_id}/versions", headers=headers)
    history = history_resp.json()
    for entry in history:
        assert entry["status"] == "RETIRED"

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

PROF_EMAIL = "constructor_options@vu.nl"
PROF_PASS = "pass"

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    user = db.query(User).filter(User.email == PROF_EMAIL).first()
    if not user:
        user = User(email=PROF_EMAIL, hashed_password=hash_password(PROF_PASS), role=UserRole.CONSTRUCTOR)
        db.add(user)
        db.commit()
    
    bank = ItemBank(name="Options Test Bank", created_by=user.id)
    db.add(bank)
    db.commit()
    
    lo = LearningObject(bank_id=bank.id, created_by=user.id)
    db.add(lo)
    db.commit()
    db.refresh(lo)
    
    yield {"lo_id": str(lo.id), "user_id": str(user.id)}
    db.close()

def login(email: str, password: str) -> str:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]

def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

def test_save_mcq_options(setup_db):
    """Test saving a DRAFT with valid MCQ options."""
    lo_id = setup_db["lo_id"]
    token = login(PROF_EMAIL, PROF_PASS)
    headers = auth(token)
    
    payload = {
        "learning_object_id": lo_id,
        "status": "DRAFT",
        "question_type": "MULTIPLE_CHOICE",
        "content": {"raw": "What is 2+2?"},
        "options": {
            "question_type": "MULTIPLE_CHOICE",
            "choices": [
                {"id": "A", "text": "3", "is_correct": False, "weight": 0.0},
                {"id": "B", "text": "4", "is_correct": True, "weight": 1.0}
            ]
        }
    }
    
    resp = client.post(f"/api/learning-objects/{lo_id}/versions", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["version_number"] == 1
    assert data["options"]["question_type"] == "MULTIPLE_CHOICE"
    assert len(data["options"]["choices"]) == 2
    assert data["options"]["choices"][1]["is_correct"] is True

def test_save_mcq_options_validation_failure(setup_db):
    """Test Pydantic discriminatory union fails when structure mismatches."""
    lo_id = setup_db["lo_id"]
    token = login(PROF_EMAIL, PROF_PASS)
    headers = auth(token)
    
    payload = {
        "learning_object_id": lo_id,
        "status": "DRAFT",
        "question_type": "MULTIPLE_CHOICE",
        "content": {"raw": "Mismatched options validation"},
        "options": {
            "question_type": "MULTIPLE_CHOICE",
            # Missing "choices" array, which is required by MCQOptions Schema
            "min_words": 100 
        }
    }
    
    resp = client.post(f"/api/learning-objects/{lo_id}/versions", json=payload, headers=headers)
    assert resp.status_code == 422 # Unprocessable Entity

def test_save_essay_options(setup_db):
    """Test saving a DRAFT with valid Essay options."""
    lo_id = setup_db["lo_id"]
    token = login(PROF_EMAIL, PROF_PASS)
    headers = auth(token)
    
    payload = {
        "learning_object_id": lo_id,
        "status": "DRAFT",
        "question_type": "ESSAY",
        "content": {"raw": "Write an essay about WW2."},
        "options": {
            "question_type": "ESSAY",
            "min_words": 500,
            "max_words": 1000
        }
    }
    
    resp = client.post(f"/api/learning-objects/{lo_id}/versions", json=payload, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["options"]["min_words"] == 500

def test_immutability_overwrite_draft(setup_db):
    """Test rapid saving overwrites the same DRAFT version."""
    lo_id = setup_db["lo_id"]
    token = login(PROF_EMAIL, PROF_PASS)
    headers = auth(token)
    
    payload = {
        "learning_object_id": lo_id,
        "status": "DRAFT",
        "question_type": "MULTIPLE_CHOICE",
        "content": {"raw": "Draft 1.0"},
        "options": {
            "question_type": "MULTIPLE_CHOICE",
            "choices": []
        }
    }
    
    # Save 1
    resp1 = client.post(f"/api/learning-objects/{lo_id}/versions", json=payload, headers=headers)
    v1_id = resp1.json()["id"]
    assert resp1.json()["version_number"] == 1
    
    # Save 2 (overwrites)
    payload["content"]["raw"] = "Draft 1.1"
    payload["options"]["choices"] = [{"id": "A", "text": "Option A", "is_correct": True, "weight": 1.0}]
    resp2 = client.post(f"/api/learning-objects/{lo_id}/versions", json=payload, headers=headers)
    
    assert resp2.json()["version_number"] == 1
    assert resp2.json()["id"] == v1_id # ID must remain exactly the same
    assert len(resp2.json()["options"]["choices"]) == 1

def test_immutability_bump_version_after_review(setup_db):
    """Test that saving AFTER a draft has been moved to review triggers a version bump."""
    lo_id = setup_db["lo_id"]
    token = login(PROF_EMAIL, PROF_PASS)
    headers = auth(token)
    
    # Assuming the lo currently has a DRAFT version 1 from previous tests
    # Transition to READY_FOR_REVIEW
    history = client.get(f"/api/learning-objects/{lo_id}/versions", headers=headers).json()
    latest_v_id = history[0]["id"]
    
    client.patch(f"/api/learning-objects/{lo_id}/versions/{latest_v_id}/status", 
                 json={"new_status": "READY_FOR_REVIEW"}, headers=headers)
    
    # Save again (should bump to DRAFT version 2)
    payload = {
        "learning_object_id": lo_id,
        "status": "DRAFT",
        "question_type": "MULTIPLE_CHOICE",
        "content": {"raw": "Draft 2.0"},
        "options": {"question_type": "MULTIPLE_CHOICE", "choices": []}
    }
    
    resp3 = client.post(f"/api/learning-objects/{lo_id}/versions", json=payload, headers=headers)
    assert resp3.status_code == 200
    assert resp3.json()["version_number"] == 2
    assert resp3.json()["status"] == "DRAFT"
    assert resp3.json()["id"] != latest_v_id

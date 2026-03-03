import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import uuid

from app.main import app
from app.core.database import Base, get_db
from app.models.user import User, UserRole
from app.models.item_version import ItemVersion, ItemStatus, QuestionType
from app.models.learning_object import LearningObject
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

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    # Setup base entities
    admin = User(
        email="matrix_admin@vu.nl", 
        hashed_password=hash_password("pass"),
        role=UserRole.ADMIN
    )
    db.add(admin)
    db.commit()
    
    bank = ItemBank(name="Matrix Bank", created_by=admin.id)
    db.add(bank)
    db.commit()
    
    # Create 2 approved LOs
    for i in range(2):
        lo = LearningObject(bank_id=bank.id, created_by=admin.id)
        db.add(lo)
        db.commit()
        db.refresh(lo)
        
        v = ItemVersion(
            learning_object_id=lo.id,
            version_number=1,
            status=ItemStatus.APPROVED,
            question_type=QuestionType.MULTIPLE_CHOICE,
            content={"text": f"Question {i}"},
            options={"question_type": "MULTIPLE_CHOICE", "choices": []},
            metadata_tags={"math": True},
            created_by=admin.id
        )
        db.add(v)
        db.commit()
        
    yield {"admin_id": str(admin.id), "lo_ids": [str(lo.id) for lo in db.query(LearningObject).all()]}
    db.close()

def login(email: str, password: str) -> str:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]

def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

def test_create_test_definition(setup_db):
    token = login("matrix_admin@vu.nl", "pass")
    headers = auth(token)
    lo_id = setup_db["lo_ids"][0]
    
    payload = {
        "title": "Final Exam",
        "blocks": [
            {
                "title": "Section A",
                "rules": [
                    {"rule_type": "FIXED", "learning_object_id": lo_id},
                    {"rule_type": "RANDOM", "count": 1, "tags": ["math"]}
                ]
            }
        ],
        "duration_minutes": 120
    }
    
    resp = client.post("/api/tests/", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Final Exam"
    assert len(data["blocks"]) == 1
    assert data["blocks"][0]["title"] == "Section A"
    assert data["id"] is not None


def test_validate_test_definition(setup_db):
    token = login("matrix_admin@vu.nl", "pass")
    headers = auth(token)
    
    # Create a test first
    lo_id = setup_db["lo_ids"][0]
    payload = {
        "title": "Validation Test",
        "blocks": [
            {
                "title": "Rules",
                "rules": [
                    {"rule_type": "FIXED", "learning_object_id": lo_id},
                    {"rule_type": "RANDOM", "count": 1, "tags": ["math"]}, # Should pass (2 match)
                    {"rule_type": "RANDOM", "count": 10, "tags": ["math"]} # Should fail
                ]
            }
        ]
    }
    create_resp = client.post("/api/tests/", json=payload, headers=headers)
    test_id = create_resp.json()["id"]
    
    # Run validation
    val_resp = client.post(f"/api/tests/{test_id}/validate", headers=headers)
    assert val_resp.status_code == 200
    val_data = val_resp.json()
    
    assert val_data["valid"] is False # Because of the rule seeking 10 items
    rules = val_data["blocks"][0]["rule_validation"]
    assert rules[0]["valid"] is True # Fixed
    assert rules[1]["valid"] is True # Random 1
    assert rules[2]["valid"] is False # Random 10

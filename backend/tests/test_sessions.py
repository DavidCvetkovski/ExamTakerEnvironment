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
from app.models.test_definition import TestDefinition
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
    
    admin = User(email="admin_freeze@vu.nl", hashed_password=hash_password("pass"), role=UserRole.ADMIN)
    student = User(email="student_freeze@vu.nl", hashed_password=hash_password("pass"), role=UserRole.STUDENT)
    db.add_all([admin, student])
    db.commit()
    
    bank = ItemBank(name="Freeze Bank", created_by=admin.id)
    db.add(bank)
    db.commit()
    
    # Create 3 approved LOs with 'math' tag
    lo_ids = []
    for i in range(3):
        lo = LearningObject(bank_id=bank.id, created_by=admin.id)
        db.add(lo)
        db.commit()
        db.refresh(lo)
        lo_ids.append(lo.id)
        
        v = ItemVersion(
            learning_object_id=lo.id,
            version_number=1,
            status=ItemStatus.APPROVED,
            question_type=QuestionType.MULTIPLE_CHOICE,
            content={"text": f"Math Question {i}"},
            options={"choices": []},
            metadata_tags={"math": True},
            created_by=admin.id
        )
        db.add(v)
    db.commit()
    
    # Create a Test Blueprint
    test = TestDefinition(
        title="Frozen Exam",
        created_by=admin.id,
        blocks=[{
            "title": "Main Section",
            "rules": [
                {"rule_type": "FIXED", "learning_object_id": str(lo_ids[0])},
                {"rule_type": "RANDOM", "count": 2, "tags": ["math"]}
            ]
        }],
        duration_minutes=60
    )
    db.add(test)
    db.commit()
    db.refresh(test)
    
    yield {"test_id": str(test.id), "lo_ids": [str(lid) for lid in lo_ids]}
    db.close()

def login(email: str, password: str) -> str:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]

def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

def test_instantiate_and_freeze(setup_db):
    token = login("student_freeze@vu.nl", "pass")
    headers = auth(token)
    
    resp = client.post("/api/sessions/", json={"test_definition_id": setup_db["test_id"]}, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    
    assert data["test_definition_id"] == setup_db["test_id"]
    assert len(data["items"]) == 3 # 1 Fixed + 2 Random
    assert data["status"] == "STARTED"
    
    # Check item snapshots
    item_ids = [item["learning_object_id"] for item in data["items"]]
    assert setup_db["lo_ids"][0] in item_ids # Fixed item must be there
    
    # Verify "The Freeze" - change the item content in the bank
    db = TestingSessionLocal()
    admin = db.query(User).filter(User.email == "admin_freeze@vu.nl").first()
    lo_id = setup_db["lo_ids"][0]
    
    # Add a new version (v2) which is APPROVED
    v2 = ItemVersion(
        learning_object_id=lo_id,
        version_number=2,
        status=ItemStatus.APPROVED,
        question_type=QuestionType.MULTIPLE_CHOICE,
        content={"text": "UPDATED Math Question 0"},
        options={"choices": []},
        created_by=admin.id
    )
    db.add(v2)
    db.commit()
    
    # Retrieve the session again
    get_resp = client.get(f"/api/sessions/{data['id']}", headers=headers)
    session_data = get_resp.json()
    
    # Find the fixed item in the session
    fixed_item = next(item for item in session_data["items"] if item["learning_object_id"] == lo_id)
    
    # IT SHOULD STILL BE VERSION 1 (FROZEN)
    assert fixed_item["version_number"] == 1
    assert fixed_item["content"]["text"] == "Math Question 0"
    
    db.close()

def test_unauthorized_access(setup_db):
    # Setup another student
    db = TestingSessionLocal()
    other_student = User(email="other@vu.nl", hashed_password=hash_password("pass"), role=UserRole.STUDENT)
    db.add(other_student)
    db.commit()
    db.close()
    
    # Student 1 creates a session
    s1_token = login("student_freeze@vu.nl", "pass")
    resp = client.post("/api/sessions/", json={"test_definition_id": setup_db["test_id"]}, headers=auth(s1_token))
    session_id = resp.json()["id"]
    
    # Student 2 tries to access IT
    s2_token = login("other@vu.nl", "pass")
    get_resp = client.get(f"/api/sessions/{session_id}", headers=auth(s2_token))
    assert get_resp.status_code == 403

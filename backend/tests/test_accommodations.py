import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timedelta
import uuid

from app.main import app
from app.core.database import Base, get_db
from app.models.user import User, UserRole
from app.models.test_definition import TestDefinition
from app.models.exam_session import ExamSession, SessionStatus
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
    
    admin = User(email="admin_acc@vu.nl", hashed_password=hash_password("pass"), role=UserRole.ADMIN)
    # Standard student
    student = User(email="student_standard@vu.nl", hashed_password=hash_password("pass"), role=UserRole.STUDENT, provision_time_multiplier=1.0)
    # Student with 25% extra time
    student_acc = User(email="student_extra@vu.nl", hashed_password=hash_password("pass"), role=UserRole.STUDENT, provision_time_multiplier=1.25)
    
    db.add_all([admin, student, student_acc])
    db.commit()
    
    # Create a Test Blueprint (60 minutes)
    test = TestDefinition(
        title="Timed Exam",
        created_by=admin.id,
        blocks=[{
            "title": "Section 1",
            "rules": []
        }],
        duration_minutes=60
    )
    db.add(test)
    db.commit()
    db.refresh(test)
    
    yield {"test_id": str(test.id)}
    db.close()

def login(email: str, password: str) -> str:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]

def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

def test_time_multiplier_application(setup_db):
    # 1. Standard student
    token = login("student_standard@vu.nl", "pass")
    resp = client.post("/api/sessions/", json={"test_definition_id": setup_db["test_id"]}, headers=auth(token))
    assert resp.status_code == 201
    data = resp.json()
    
    expires_at = datetime.fromisoformat(data["expires_at"].replace('Z', '+00:00'))
    started_at = datetime.fromisoformat(data["started_at"].replace('Z', '+00:00'))
    diff = (expires_at - started_at).total_seconds() / 60
    assert abs(diff - 60) < 1 # Should be roughly 60 mins
    
    # 2. Extra time student
    token_acc = login("student_extra@vu.nl", "pass")
    resp_acc = client.post("/api/sessions/", json={"test_definition_id": setup_db["test_id"]}, headers=auth(token_acc))
    assert resp_acc.status_code == 201
    data_acc = resp_acc.json()
    
    expires_at_acc = datetime.fromisoformat(data_acc["expires_at"].replace('Z', '+00:00'))
    started_at_acc = datetime.fromisoformat(data_acc["started_at"].replace('Z', '+00:00'))
    diff_acc = (expires_at_acc - started_at_acc).total_seconds() / 60
    assert abs(diff_acc - 75) < 1 # 60 * 1.25 = 75 mins

def test_auto_expiration_on_retrieval(setup_db):
    token = login("student_standard@vu.nl", "pass")
    headers = auth(token)
    
    # Create session
    resp = client.post("/api/sessions/", json={"test_definition_id": setup_db["test_id"]}, headers=headers)
    assert resp.status_code == 201
    session_id = resp.json()["id"]
    
    # Manually expire it in the database
    db = TestingSessionLocal()
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    session.expires_at = datetime.utcnow() - timedelta(minutes=10)
    db.commit()
    db.close()
    
    # Retrieve it
    get_resp = client.get(f"/api/sessions/{session_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["status"] == "EXPIRED"

import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core.database import Base, get_db
from app.models.item_bank import ItemBank
from app.models.user import User, UserRole
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
    user = User(
        email="lib_admin@vu.nl", 
        hashed_password=hash_password("pass"),
        role=UserRole.CONSTRUCTOR
    )
    db.add(user)
    db.commit()
    yield
    db.close()

def login(email: str, password: str) -> str:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]

def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

def test_list_learning_objects_empty():
    token = login("lib_admin@vu.nl", "pass")
    
    headers = auth(token)
    response = client.get("/api/learning-objects", headers=headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_create_and_list_learning_object():
    token = login("lib_admin@vu.nl", "pass")
    headers = auth(token)
    
    # Create new LO
    create_res = client.post("/api/learning-objects", headers=headers)
    assert create_res.status_code == 200
    lo_id = create_res.json()["learning_object_id"]
    
    # List LOs
    list_res = client.get("/api/learning-objects", headers=headers)
    assert list_res.status_code == 200
    data = list_res.json()
    assert len(data) > 0
    
    # Find the one we just created
    item = next((i for i in data if i["id"] == lo_id), None)
    assert item is not None
    assert item["latest_version_number"] == 1
    assert item["latest_status"] == "DRAFT"
    assert item["latest_question_type"] == "MULTIPLE_CHOICE"

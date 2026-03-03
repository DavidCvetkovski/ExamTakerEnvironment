"""
Stage 4 Test Suite for the Auth Router
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core.database import Base, get_db
from app.models.user import User, UserRole

DATABASE_URL = "postgresql+psycopg://postgres:password@localhost:5432/openvision"
engine = create_engine(DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    # No need to wipe after, just isolating run

def test_register_new_user():
    resp = client.post("/api/auth/register", json={
        "email": "testauth@vu.nl",
        "password": "strongpassword123",
        "role": "STUDENT"
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == "testauth@vu.nl"
    assert data["user"]["role"] == "STUDENT"

def test_register_duplicate_user_fails():
    resp = client.post("/api/auth/register", json={
        "email": "testauth@vu.nl",
        "password": "anotherpassword",
        "role": "STUDENT"
    })
    assert resp.status_code == 409

def test_login_success_sets_cookie():
    resp = client.post("/api/auth/login", json={
        "email": "testauth@vu.nl",
        "password": "strongpassword123"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    
    # Check that HttpOnly cookie was set
    cookies = resp.cookies
    assert "refresh_token" in cookies

def test_login_invalid_password():
    resp = client.post("/api/auth/login", json={
        "email": "testauth@vu.nl",
        "password": "wrong"
    })
    assert resp.status_code == 401

def test_get_me_with_valid_token():
    # Login to get token
    login_resp = client.post("/api/auth/login", json={
        "email": "testauth@vu.nl",
        "password": "strongpassword123"
    })
    token = login_resp.json()["access_token"]
    
    # Use token
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "testauth@vu.nl"

def test_refresh_token_endpoint():
    import time
    # Login to get refresh cookie
    login_resp = client.post("/api/auth/login", json={
        "email": "testauth@vu.nl",
        "password": "strongpassword123"
    })
    refresh_cookie = login_resp.cookies.get("refresh_token")
    
    # Wait 1 second so the exp/iat claims in the JWT payload change, resulting in a different token string
    time.sleep(1)
    
    # Use cookie to get new access token
    refresh_resp = client.post("/api/auth/refresh", cookies={"refresh_token": refresh_cookie})
    assert refresh_resp.status_code == 200
    data = refresh_resp.json()
    assert "access_token" in data
    assert data["access_token"] != login_resp.json()["access_token"]

def test_logout_clears_cookie():
    login_resp = client.post("/api/auth/login", json={
        "email": "testauth@vu.nl",
        "password": "strongpassword123"
    })
    
    logout_resp = client.post("/api/auth/logout", cookies={"refresh_token": login_resp.cookies.get("refresh_token")})
    assert logout_resp.status_code == 200
    
    # Extract set-cookie header directly from the headers list
    set_cookie_headers = logout_resp.headers.get_list('set-cookie')
    has_cleared_cookie = any('refresh_token=""' in header for header in set_cookie_headers)
    assert has_cleared_cookie

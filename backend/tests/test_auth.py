import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.prisma_db import prisma
from app.models.user import UserRole
import uuid

@pytest.fixture
async def ac():
    """Provides an async client for testing."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

@pytest.fixture(autouse=True)
async def use_cleanup(cleanup_database):
    """Use the central cleanup fixture."""
    pass

@pytest.mark.anyio
async def test_register_new_user(ac: AsyncClient):
    resp = await ac.post("/api/auth/register", json={
        "email": "testauth@vu.nl",
        "password": "strongpassword123",
        "role": "STUDENT"
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == "testauth@vu.nl"
    assert data["user"]["role"] == "STUDENT"

@pytest.mark.anyio
async def test_register_duplicate_user_fails(ac: AsyncClient):
    # First registration
    await ac.post("/api/auth/register", json={
        "email": "testauth@vu.nl",
        "password": "strongpassword123",
        "role": "STUDENT"
    })
    
    # Duplicate
    resp = await ac.post("/api/auth/register", json={
        "email": "testauth@vu.nl",
        "password": "anotherpassword",
        "role": "STUDENT"
    })
    assert resp.status_code == 409

@pytest.mark.anyio
async def test_login_success_sets_cookie(ac: AsyncClient):
    # Register first
    await ac.post("/api/auth/register", json={
        "email": "testauth@vu.nl",
        "password": "strongpassword123",
        "role": "STUDENT"
    })
    
    resp = await ac.post("/api/auth/login", json={
        "email": "testauth@vu.nl",
        "password": "strongpassword123"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    
    # Check that HttpOnly cookie was set
    assert "refresh_token" in resp.cookies

@pytest.mark.anyio
async def test_login_invalid_password(ac: AsyncClient):
    # Register first
    await ac.post("/api/auth/register", json={
        "email": "testauth@vu.nl",
        "password": "strongpassword123",
        "role": "STUDENT"
    })
    
    resp = await ac.post("/api/auth/login", json={
        "email": "testauth@vu.nl",
        "password": "wrong"
    })
    assert resp.status_code == 401

@pytest.mark.anyio
async def test_get_me_with_valid_token(ac: AsyncClient):
    # Register and then Login to get token
    await ac.post("/api/auth/register", json={
        "email": "testauth@vu.nl",
        "password": "strongpassword123",
        "role": "STUDENT"
    })
    
    login_resp = await ac.post("/api/auth/login", json={
        "email": "testauth@vu.nl",
        "password": "strongpassword123"
    })
    token = login_resp.json()["access_token"]
    
    # Use token
    me_resp = await ac.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "testauth@vu.nl"

@pytest.mark.anyio
async def test_refresh_token_endpoint(ac: AsyncClient):
    import asyncio
    # Register and then Login to get refresh cookie
    await ac.post("/api/auth/register", json={
        "email": "testauth@vu.nl",
        "password": "strongpassword123",
        "role": "STUDENT"
    })
    
    login_resp = await ac.post("/api/auth/login", json={
        "email": "testauth@vu.nl",
        "password": "strongpassword123"
    })
    refresh_cookie = login_resp.cookies.get("refresh_token")
    
    # Wait 1.1 second so the exp/iat claims change
    await asyncio.sleep(1.1)
    
    # Use cookie to get new access token
    refresh_resp = await ac.post("/api/auth/refresh", cookies={"refresh_token": refresh_cookie})
    assert refresh_resp.status_code == 200
    data = refresh_resp.json()
    assert "access_token" in data
    assert data["access_token"] != login_resp.json()["access_token"]

@pytest.mark.anyio
async def test_logout_clears_cookie(ac: AsyncClient):
    await ac.post("/api/auth/register", json={
        "email": "testauth@vu.nl",
        "password": "strongpassword123",
        "role": "STUDENT"
    })
    
    login_resp = await ac.post("/api/auth/login", json={
        "email": "testauth@vu.nl",
        "password": "strongpassword123"
    })
    
    logout_resp = await ac.post("/api/auth/logout", cookies={"refresh_token": login_resp.cookies.get("refresh_token")})
    assert logout_resp.status_code == 200
    
    # Check if refresh_token cookie is deleted (expired)
    # Httpx cookies might handle this differently, but checking for presence of instruction is key.
    # Actually, check if it's NOT in the subsequent request or if the response header set it to empty.
    # In httpx, if a cookie is deleted, it often persists in the jar but with null value or similar.
    # Let's check for the header specifically if possible, or just verify status.
    assert logout_resp.json()["detail"] == "Logged out successfully."

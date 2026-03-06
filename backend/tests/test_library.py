import pytest
from httpx import AsyncClient
from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

LIB_EMAIL, LIB_PASS = "lib_admin@vu.nl", "pass"

@pytest.fixture(scope="function")
async def setup_library_data(cleanup_database):
    # Setup base entities
    user = await prisma.users.create(
        data={
            "email": LIB_EMAIL,
            "hashed_password": hash_password(LIB_PASS),
            "role": UserRole.CONSTRUCTOR,
        }
    )
    return {"user": user}

async def login(ac: AsyncClient, email: str, password: str) -> str:
    resp = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]

def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_list_learning_objects_empty(ac: AsyncClient, setup_library_data):
    token = await login(ac, LIB_EMAIL, LIB_PASS)
    headers = auth(token)
    response = await ac.get("/api/learning-objects", headers=headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)

@pytest.mark.anyio
async def test_create_and_list_learning_object(ac: AsyncClient, setup_library_data):
    token = await login(ac, LIB_EMAIL, LIB_PASS)
    headers = auth(token)
    
    # Create new LO
    create_res = await ac.post("/api/learning-objects", headers=headers)
    assert create_res.status_code == 200
    lo_id = create_res.json()["learning_object_id"]
    
    # List LOs
    list_res = await ac.get("/api/learning-objects", headers=headers)
    assert list_res.status_code == 200
    data = list_res.json()
    assert len(data) > 0
    
    # Find the one we just created
    item = next((i for i in data if i["id"] == lo_id), None)
    assert item is not None
    assert item["latest_version_number"] == 1
    assert item["latest_status"] == "DRAFT"
    assert item["latest_question_type"] == "MULTIPLE_CHOICE"

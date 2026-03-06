import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.prisma_db import prisma
from app.models.item_version import ItemStatus, QuestionType
from app.models.user import UserRole
from app.core.security import hash_password
import uuid

@pytest.fixture
async def ac():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

@pytest.fixture(autouse=True)
async def use_cleanup(cleanup_database):
    pass

PROF_EMAIL = "prof_test@vu.nl"
PROF_PASS = "profpass123"

async def login(ac: AsyncClient, email: str, password: str) -> str:
    resp = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]

def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
async def setup_test_data():
    # Setup base entities using Prisma
    user = await prisma.users.create(
        data={
            "email": PROF_EMAIL,
            "hashed_password": hash_password(PROF_PASS),
            "role": "CONSTRUCTOR",
            "is_active": True,
            "provision_time_multiplier": 1.0
        }
    )
    
    bank = await prisma.item_banks.create(
        data={
            "name": "Test Bank",
            "created_by": user.id
        }
    )
    
    lo = await prisma.learning_objects.create(
        data={
            "bank_id": bank.id,
            "created_by": user.id
        }
    )
    
    return {"lo_id": str(lo.id), "user_id": str(user.id)}

@pytest.mark.anyio
async def test_immutability_version_up_logic(ac: AsyncClient, setup_test_data):
    lo_id = setup_test_data["lo_id"]
    token = await login(ac, PROF_EMAIL, PROF_PASS)
    headers = auth(token)
    
    # 1. User Creates Draft 1
    payload_draft_1 = {
        "learning_object_id": lo_id,
        "status": "DRAFT",
        "question_type": "ESSAY",
        "content": {"raw": "Draft 1"},
        "options": {
            "question_type": "ESSAY",
            "min_words": 100,
            "max_words": 200
        }
    }
    
    resp1 = await ac.post(f"/api/learning-objects/{lo_id}/versions", json=payload_draft_1, headers=headers)
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["version_number"] == 1
    assert data1["status"] == "DRAFT"
    
    # 2. User Edits Draft 1
    payload_draft_1["content"]["raw"] = "Draft 1 Edited"
    resp2 = await ac.post(f"/api/learning-objects/{lo_id}/versions", json=payload_draft_1, headers=headers)
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["version_number"] == 1
    assert data2["content"]["raw"] == "Draft 1 Edited"
    
    # 3. Transition to READY_FOR_REVIEW then APPROVED
    await ac.patch(f"/api/learning-objects/{lo_id}/versions/{data2['id']}/status", 
                 json={"new_status": "READY_FOR_REVIEW"}, headers=headers)
    
    # Create a reviewer
    reviewer = await prisma.users.create(
        data={
            "email": "reviewer_items@vu.nl",
            "hashed_password": hash_password("pass"),
            "role": "REVIEWER",
            "is_active": True,
            "provision_time_multiplier": 1.0
        }
    )
    reviewer_token = await login(ac, "reviewer_items@vu.nl", "pass")
    
    await ac.patch(f"/api/learning-objects/{lo_id}/versions/{data2['id']}/status", 
                 json={"new_status": "APPROVED"}, headers=auth(reviewer_token))
    
    # 4. Edit Approved Question (Should Create V2)
    payload_draft_new = {
        "learning_object_id": lo_id,
        "status": "DRAFT",
        "question_type": "ESSAY",
        "content": {"raw": "Draft 1 Edited - Fixed Typo"},
        "options": {
            "question_type": "ESSAY",
            "min_words": 100,
            "max_words": 200
        }
    }
    
    resp3 = await ac.post(f"/api/learning-objects/{lo_id}/versions", json=payload_draft_new, headers=headers)
    assert resp3.status_code == 200
    data3 = resp3.json()
    assert data3["version_number"] == 2
    assert data3["status"] == "DRAFT"
    
    # Verify history
    history_resp = await ac.get(f"/api/learning-objects/{lo_id}/versions", headers=headers)
    history = history_resp.json()
    assert len(history) == 2
    assert history[0]["version_number"] == 2
    assert history[1]["version_number"] == 1
    assert history[1]["status"] == "APPROVED"

@pytest.mark.anyio
async def test_cascading_soft_delete(ac: AsyncClient, setup_test_data):
    lo_id = setup_test_data["lo_id"]
    token = await login(ac, PROF_EMAIL, PROF_PASS)
    headers = auth(token)
    
    # Create a version first
    payload = {
        "learning_object_id": lo_id,
        "status": "DRAFT",
        "question_type": "ESSAY",
        "content": {"raw": "Test"},
        "options": {"question_type": "ESSAY"}
    }
    await ac.post(f"/api/learning-objects/{lo_id}/versions", json=payload, headers=headers)
    
    resp = await ac.delete(f"/api/learning-objects/{lo_id}", headers=headers)
    assert resp.status_code == 200
    
    # Verify versions are retired
    history_resp = await ac.get(f"/api/learning-objects/{lo_id}/versions", headers=headers)
    history = history_resp.json()
    for entry in history:
        assert entry["status"] == "RETIRED"

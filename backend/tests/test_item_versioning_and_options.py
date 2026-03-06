import pytest
from httpx import AsyncClient
from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PROF_EMAIL, PROF_PASS = "constructor_options@vu.nl", "pass"

@pytest.fixture(scope="function")
async def setup_options_data(cleanup_database):
    user = await prisma.users.create(
        data={
            "email": PROF_EMAIL,
            "hashed_password": hash_password(PROF_PASS),
            "role": UserRole.CONSTRUCTOR,
        }
    )
    
    bank = await prisma.item_banks.create(
        data={
            "name": "Options Test Bank",
            "created_by": user.id,
        }
    )
    
    lo = await prisma.learning_objects.create(
        data={
            "bank_id": bank.id,
            "created_by": user.id,
        }
    )
    
    return {"lo_id": lo.id, "user_id": user.id}

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
async def test_save_mcq_options(ac: AsyncClient, setup_options_data):
    """Test saving a DRAFT with valid MCQ options."""
    lo_id = setup_options_data["lo_id"]
    token = await login(ac, PROF_EMAIL, PROF_PASS)
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
    
    resp = await ac.post(f"/api/learning-objects/{lo_id}/versions", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["version_number"] == 1
    assert data["options"]["question_type"] == "MULTIPLE_CHOICE"
    assert len(data["options"]["choices"]) == 2
    assert data["options"]["choices"][1]["is_correct"] is True

@pytest.mark.anyio
async def test_save_mcq_options_validation_failure(ac: AsyncClient, setup_options_data):
    """Test Pydantic discriminatory union fails when structure mismatches."""
    lo_id = setup_options_data["lo_id"]
    token = await login(ac, PROF_EMAIL, PROF_PASS)
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
    
    resp = await ac.post(f"/api/learning-objects/{lo_id}/versions", json=payload, headers=headers)
    assert resp.status_code == 422 # Unprocessable Entity

@pytest.mark.anyio
async def test_save_essay_options(ac: AsyncClient, setup_options_data):
    """Test saving a DRAFT with valid Essay options."""
    lo_id = setup_options_data["lo_id"]
    token = await login(ac, PROF_EMAIL, PROF_PASS)
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
    
    resp = await ac.post(f"/api/learning-objects/{lo_id}/versions", json=payload, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["options"]["min_words"] == 500

@pytest.mark.anyio
async def test_immutability_overwrite_draft(ac: AsyncClient, setup_options_data):
    """Test rapid saving overwrites the same DRAFT version."""
    lo_id = setup_options_data["lo_id"]
    token = await login(ac, PROF_EMAIL, PROF_PASS)
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
    resp1 = await ac.post(f"/api/learning-objects/{lo_id}/versions", json=payload, headers=headers)
    v1_id = resp1.json()["id"]
    assert resp1.json()["version_number"] == 1
    
    # Save 2 (overwrites)
    payload["content"]["raw"] = "Draft 1.1"
    payload["options"]["choices"] = [{"id": "A", "text": "Option A", "is_correct": True, "weight": 1.0}]
    resp2 = await ac.post(f"/api/learning-objects/{lo_id}/versions", json=payload, headers=headers)
    
    assert resp2.json()["version_number"] == 1
    assert resp2.json()["id"] == v1_id # ID must remain exactly the same
    assert len(resp2.json()["options"]["choices"]) == 1

@pytest.mark.anyio
async def test_immutability_bump_version_after_review(ac: AsyncClient, setup_options_data):
    """Test that saving AFTER a draft has been moved to review triggers a version bump."""
    lo_id = setup_options_data["lo_id"]
    token = await login(ac, PROF_EMAIL, PROF_PASS)
    headers = auth(token)
    
    # Create the first draft
    payload = {
        "learning_object_id": lo_id,
        "status": "DRAFT",
        "question_type": "MULTIPLE_CHOICE",
        "content": {"raw": "Draft 1.0"},
        "options": {"question_type": "MULTIPLE_CHOICE", "choices": []}
    }
    resp1 = await ac.post(f"/api/learning-objects/{lo_id}/versions", json=payload, headers=headers)
    latest_v_id = resp1.json()["id"]
    
    # Transition to READY_FOR_REVIEW
    await ac.patch(f"/api/learning-objects/{lo_id}/versions/{latest_v_id}/status", 
                 json={"new_status": "READY_FOR_REVIEW"}, headers=headers)
    
    # Save again (should bump to DRAFT version 2)
    payload["content"]["raw"] = "Draft 2.0"
    resp3 = await ac.post(f"/api/learning-objects/{lo_id}/versions", json=payload, headers=headers)
    assert resp3.status_code == 200
    assert resp3.json()["version_number"] == 2
    assert resp3.json()["status"] == "DRAFT"
    assert resp3.json()["id"] != latest_v_id

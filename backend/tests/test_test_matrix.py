import pytest
from httpx import AsyncClient
from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole
from app.models.item_version import ItemStatus, QuestionType
import prisma as prisma_lib

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ADMIN_EMAIL, ADMIN_PASS = "matrix_admin@vu.nl", "pass"

@pytest.fixture(scope="function")
async def setup_matrix_data(cleanup_database):
    admin = await prisma.users.create(
        data={
            "email": ADMIN_EMAIL,
            "hashed_password": hash_password(ADMIN_PASS),
            "role": UserRole.ADMIN,
        }
    )
    
    bank = await prisma.item_banks.create(
        data={
            "name": "Matrix Bank",
            "created_by": admin.id,
        }
    )
    
    lo_ids = []
    # Create 2 approved LOs
    for i in range(2):
        lo = await prisma.learning_objects.create(
            data={
                "bank_id": bank.id,
                "created_by": admin.id,
            }
        )
        lo_ids.append(lo.id)
        
        await prisma.item_versions.create(
            data={
                "learning_object_id": lo.id,
                "version_number": 1,
                "status": ItemStatus.APPROVED,
                "question_type": QuestionType.MULTIPLE_CHOICE,
                "content": prisma_lib.Json({"text": f"Question {i}"}),
                "options": prisma_lib.Json({"question_type": "MULTIPLE_CHOICE", "choices": []}),
                "metadata_tags": prisma_lib.Json({"math": True}),
                "created_by": admin.id
            }
        )
        
    return {"admin_id": admin.id, "lo_ids": lo_ids}

async def login(ac: AsyncClient, email: str, password: str) -> str:
    resp = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]

def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_create_test_definition(ac: AsyncClient, setup_matrix_data):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    headers = auth(token)
    lo_id = setup_matrix_data["lo_ids"][0]
    
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
    
    resp = await ac.post("/api/tests/", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Final Exam"
    assert len(data["blocks"]) == 1
    assert data["blocks"][0]["title"] == "Section A"
    assert data["id"] is not None

@pytest.mark.anyio
async def test_get_test_definition(ac: AsyncClient, setup_matrix_data):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    headers = auth(token)
    lo_id = setup_matrix_data["lo_ids"][0]

    payload = {
        "title": "Lookup Test",
        "blocks": [
            {
                "title": "Rules",
                "rules": [
                    {"rule_type": "FIXED", "learning_object_id": lo_id},
                ]
            }
        ],
        "duration_minutes": 60
    }
    create_resp = await ac.post("/api/tests/", json=payload, headers=headers)
    test_id = create_resp.json()["id"]

    get_resp = await ac.get(f"/api/tests/{test_id}", headers=headers)
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["id"] == test_id
    assert data["title"] == "Lookup Test"

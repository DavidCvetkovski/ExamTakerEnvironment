import pytest
from httpx import AsyncClient
from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole
from app.models.item_version import ItemStatus, QuestionType
from datetime import datetime, timedelta, timezone
import prisma as prisma_lib

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ADMIN_EMAIL, ADMIN_PASS = "admin_freeze@vu.nl", "pass"
STUDENT_EMAIL, STUDENT_PASS = "student_freeze@vu.nl", "pass"

@pytest.fixture(scope="function")
async def setup_sessions_data(cleanup_database):
    admin = await prisma.users.create(
        data={
            "email": ADMIN_EMAIL,
            "hashed_password": hash_password(ADMIN_PASS),
            "role": UserRole.ADMIN,
        }
    )
    student = await prisma.users.create(
        data={
            "email": STUDENT_EMAIL,
            "hashed_password": hash_password(STUDENT_PASS),
            "role": UserRole.STUDENT,
        }
    )
    
    bank = await prisma.item_banks.create(
        data={
            "name": "Freeze Bank",
            "created_by": admin.id,
        }
    )
    
    # Create 3 approved LOs with 'math' tag
    lo_ids = []
    for i in range(3):
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
                "content": prisma_lib.Json({"text": f"Math Question {i}"}),
                "options": prisma_lib.Json({"choices": []}),
                "metadata_tags": prisma_lib.Json({"math": True}),
                "created_by": admin.id
            }
        )
    
    # Create a Test Blueprint
    test = await prisma.test_definitions.create(
        data={
            "title": "Frozen Exam",
            "created_by": admin.id,
            "blocks": prisma_lib.Json([{
                "title": "Main Section",
                "rules": [
                    {"rule_type": "FIXED", "learning_object_id": lo_ids[0]},
                    {"rule_type": "RANDOM", "count": 2, "tags": ["math"]}
                ]
            }]),
            "duration_minutes": 60
        }
    )
    
    return {"test_id": test.id, "lo_ids": lo_ids, "admin_id": admin.id}

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
async def test_instantiate_and_freeze(ac: AsyncClient, setup_sessions_data):
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    headers = auth(token)
    
    resp = await ac.post("/api/sessions/practice", json={"test_definition_id": setup_sessions_data["test_id"]}, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    
    assert data["test_definition_id"] == setup_sessions_data["test_id"]
    assert len(data["items"]) == 3 # 1 Fixed + 2 Random
    assert data["status"] == "STARTED"
    assert data["session_mode"] == "PRACTICE"
    
    # Check item snapshots
    item_ids = [item["learning_object_id"] for item in data["items"]]
    assert setup_sessions_data["lo_ids"][0] in item_ids # Fixed item must be there
    
    # Verify "The Freeze" - change the item content in the bank
    lo_id = setup_sessions_data["lo_ids"][0]
    
    # Add a new version (v2) which is APPROVED
    await prisma.item_versions.create(
        data={
            "learning_object_id": lo_id,
            "version_number": 2,
            "status": ItemStatus.APPROVED,
            "question_type": QuestionType.MULTIPLE_CHOICE,
            "content": prisma_lib.Json({"text": "UPDATED Math Question 0"}),
            "options": prisma_lib.Json({"choices": []}),
            "created_by": setup_sessions_data["admin_id"]
        }
    )
    
    # Retrieve the session again
    get_resp = await ac.get(f"/api/sessions/{data['id']}", headers=headers)
    session_data = get_resp.json()
    
    # Find the fixed item in the session
    fixed_item = next(item for item in session_data["items"] if item["learning_object_id"] == lo_id)
    
    # IT SHOULD STILL BE VERSION 1 (FROZEN)
    assert fixed_item["version_number"] == 1
    assert fixed_item["content"]["text"] == "Math Question 0"

@pytest.mark.anyio
async def test_random_rule_under_provision_raises(ac: AsyncClient, setup_sessions_data):
    # Create a new test definition that over-asks the random rule
    under_provisioned_test = await prisma.test_definitions.create(
        data={
            "title": "Under-provisioned Exam",
            "created_by": setup_sessions_data["admin_id"],
            "blocks": prisma_lib.Json([
                {
                    "title": "Section",
                    "rules": [
                        {"rule_type": "RANDOM", "count": 10, "tags": ["math"]},
                    ],
                }
            ]),
            "duration_minutes": 30,
        }
    )

    # Student attempts to instantiate; should get 400 due to insufficient candidates
    token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    resp = await ac.post(
        "/api/sessions/practice",
        json={"test_definition_id": under_provisioned_test.id},
        headers=auth(token),
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "Random rule failed" in detail

@pytest.mark.anyio
async def test_unauthorized_access(ac: AsyncClient, setup_sessions_data):
    # Setup another student
    other_student = await prisma.users.create(
        data={
            "email": "other_session@vu.nl",
            "hashed_password": hash_password("pass"),
            "role": UserRole.STUDENT,
        }
    )
    
    # Admin creates a practice session
    admin_token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)
    resp = await ac.post("/api/sessions/practice", json={"test_definition_id": setup_sessions_data["test_id"]}, headers=auth(admin_token))
    session_id = resp.json()["id"]
    
    # Student 2 tries to access IT
    s2_token = await login(ac, "other_session@vu.nl", "pass")
    get_resp = await ac.get(f"/api/sessions/{session_id}", headers=auth(s2_token))
    assert get_resp.status_code == 403

@pytest.mark.anyio
async def test_student_cannot_use_legacy_practice_endpoint(ac: AsyncClient, setup_sessions_data):
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    resp = await ac.post(
        "/api/sessions/",
        json={"test_definition_id": setup_sessions_data["test_id"]},
        headers=auth(token),
    )
    assert resp.status_code == 403

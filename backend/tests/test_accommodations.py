import pytest
from httpx import AsyncClient
from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole
from datetime import datetime, timedelta, timezone
import prisma as prisma_lib

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

ADMIN_EMAIL, ADMIN_PASS = "admin_acc@vu.nl", "pass"
STANDARD_STUDENT, STANDARD_PASS = "student_standard@vu.nl", "pass"
EXTRA_STUDENT, EXTRA_PASS = "student_extra@vu.nl", "pass"

@pytest.fixture(scope="function")
async def setup_accommodations_data(cleanup_database):
    admin = await prisma.users.create(
        data={
            "email": ADMIN_EMAIL,
            "hashed_password": hash_password(ADMIN_PASS),
            "role": UserRole.ADMIN,
        }
    )
    # Standard student
    student = await prisma.users.create(
        data={
            "email": STANDARD_STUDENT,
            "hashed_password": hash_password(STANDARD_PASS),
            "role": UserRole.STUDENT,
            "provision_time_multiplier": 1.0,
        }
    )
    # Student with 25% extra time
    student_acc = await prisma.users.create(
        data={
            "email": EXTRA_STUDENT,
            "hashed_password": hash_password(EXTRA_PASS),
            "role": UserRole.STUDENT,
            "provision_time_multiplier": 1.25,
        }
    )
    
    # Create a Test Blueprint (60 minutes)
    test = await prisma.test_definitions.create(
        data={
            "title": "Timed Exam",
            "created_by": admin.id,
            "blocks": prisma_lib.Json([{
                "title": "Section 1",
                "rules": []
            }]),
            "duration_minutes": 60
        }
    )
    
    return {"test_id": test.id}

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
async def test_time_multiplier_application(ac: AsyncClient, setup_accommodations_data):
    # 1. Standard student
    token = await login(ac, STANDARD_STUDENT, STANDARD_PASS)
    resp = await ac.post("/api/sessions/", json={"test_definition_id": setup_accommodations_data["test_id"]}, headers=auth(token))
    assert resp.status_code == 201
    data = resp.json()
    
    expires_at = datetime.fromisoformat(data["expires_at"].replace('Z', '+00:00'))
    started_at = datetime.fromisoformat(data["started_at"].replace('Z', '+00:00'))
    diff = (expires_at - started_at).total_seconds() / 60
    assert abs(diff - 60) < 1 # Should be roughly 60 mins
    
    # 2. Extra time student
    token_acc = await login(ac, EXTRA_STUDENT, EXTRA_PASS)
    resp_acc = await ac.post("/api/sessions/", json={"test_definition_id": setup_accommodations_data["test_id"]}, headers=auth(token_acc))
    assert resp_acc.status_code == 201
    data_acc = resp_acc.json()
    
    expires_at_acc = datetime.fromisoformat(data_acc["expires_at"].replace('Z', '+00:00'))
    started_at_acc = datetime.fromisoformat(data_acc["started_at"].replace('Z', '+00:00'))
    diff_acc = (expires_at_acc - started_at_acc).total_seconds() / 60
    assert abs(diff_acc - 75) < 1 # 60 * 1.25 = 75 mins

@pytest.mark.anyio
async def test_auto_expiration_on_retrieval(ac: AsyncClient, setup_accommodations_data):
    token = await login(ac, STANDARD_STUDENT, STANDARD_PASS)
    headers = auth(token)
    
    # Create session
    resp = await ac.post("/api/sessions/", json={"test_definition_id": setup_accommodations_data["test_id"]}, headers=headers)
    assert resp.status_code == 201
    session_id = resp.json()["id"]
    
    # Manually expire it in the database
    # Use update_many and include required fields to bypass Prisma Python Union parsing bug on Python 3.14
    await prisma.exam_sessions.update_many(
        where={"id": session_id},
        data={
            "expires_at": datetime.now(timezone.utc) - timedelta(minutes=10),
        }
    )
    
    # Retrieve it
    get_resp = await ac.get(f"/api/sessions/{session_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["status"] == "EXPIRED"

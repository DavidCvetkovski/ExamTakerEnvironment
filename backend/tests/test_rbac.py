import pytest
from httpx import AsyncClient
from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole
import uuid

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PROF_EMAIL, PROF_PASS = "prof_rbac@vu.nl", "profpass123"
REVIEWER_EMAIL, REVIEWER_PASS = "reviewer_rbac@vu.nl", "reviewpass123"
STUDENT_EMAIL, STUDENT_PASS = "student_rbac@vu.nl", "studpass123"
ADMIN_EMAIL, ADMIN_PASS = "admin_rbac@vu.nl", "adminpass123"
LO_ID = "1a8051f9-0d48-4949-89bd-1093ae697dc9"

@pytest.fixture(scope="function")
async def setup_rbac_data(cleanup_database):
    # Setup users
    admin = await prisma.users.create(
        data={
            "email": ADMIN_EMAIL,
            "hashed_password": hash_password(ADMIN_PASS),
            "role": UserRole.ADMIN,
        }
    )
    prof = await prisma.users.create(
        data={
            "email": PROF_EMAIL,
            "hashed_password": hash_password(PROF_PASS),
            "role": UserRole.CONSTRUCTOR,
        }
    )
    reviewer = await prisma.users.create(
        data={
            "email": REVIEWER_EMAIL,
            "hashed_password": hash_password(REVIEWER_PASS),
            "role": UserRole.REVIEWER,
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
            "name": "RBAC Test Bank",
            "created_by": prof.id,
        }
    )

    lo = await prisma.learning_objects.create(
        data={
            "id": LO_ID,
            "bank_id": bank.id,
            "created_by": prof.id,
        }
    )

    return {
        "admin": admin,
        "prof": prof,
        "reviewer": reviewer,
        "student": student,
        "lo_id": LO_ID,
    }

async def login(ac: AsyncClient, email: str, password: str) -> str:
    resp = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]

def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

DRAFT_PAYLOAD = {
    "learning_object_id": LO_ID,
    "status": "DRAFT",
    "question_type": "MULTIPLE_CHOICE",
    "content": {"raw_html": "<p>What is 2+2?</p>"},
    "options": {
        "question_type": "MULTIPLE_CHOICE",
        "choices": [{"id": "A", "text": "4", "is_correct": True, "weight": 1.0}],
    },
}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_unauthenticated_request_returns_401(ac: AsyncClient, setup_rbac_data):
    resp = await ac.get(f"/api/learning-objects/{LO_ID}/versions")
    assert resp.status_code == 401

@pytest.mark.anyio
async def test_authenticated_user_can_view_versions(ac: AsyncClient, setup_rbac_data):
    token = await login(ac, PROF_EMAIL, PROF_PASS)
    resp = await ac.get(f"/api/learning-objects/{LO_ID}/versions", headers=auth(token))
    assert resp.status_code == 200

@pytest.mark.anyio
async def test_student_cannot_create_item(ac: AsyncClient, setup_rbac_data):
    token = await login(ac, STUDENT_EMAIL, STUDENT_PASS)
    resp = await ac.post(f"/api/learning-objects/{LO_ID}/versions", json=DRAFT_PAYLOAD, headers=auth(token))
    assert resp.status_code == 403

@pytest.mark.anyio
async def test_reviewer_cannot_create_item(ac: AsyncClient, setup_rbac_data):
    token = await login(ac, REVIEWER_EMAIL, REVIEWER_PASS)
    resp = await ac.post(f"/api/learning-objects/{LO_ID}/versions", json=DRAFT_PAYLOAD, headers=auth(token))
    assert resp.status_code == 403

@pytest.mark.anyio
async def test_constructor_can_create_draft(ac: AsyncClient, setup_rbac_data):
    token = await login(ac, PROF_EMAIL, PROF_PASS)
    resp = await ac.post(f"/api/learning-objects/{LO_ID}/versions", json=DRAFT_PAYLOAD, headers=auth(token))
    assert resp.status_code == 200
    assert resp.json()["status"] == "DRAFT"

@pytest.mark.anyio
async def test_full_workflow_status_transitions(ac: AsyncClient, setup_rbac_data):
    """Tests the full: DRAFT → READY_FOR_REVIEW → APPROVED lifecycle."""
    prof_token = await login(ac, PROF_EMAIL, PROF_PASS)
    reviewer_token = await login(ac, REVIEWER_EMAIL, REVIEWER_PASS)

    # Create a draft
    resp = await ac.post(f"/api/learning-objects/{LO_ID}/versions", json=DRAFT_PAYLOAD, headers=auth(prof_token))
    assert resp.status_code == 200
    version_id = resp.json()["id"]

    # Constructor submits for review
    resp = await ac.patch(
        f"/api/learning-objects/{LO_ID}/versions/{version_id}/status",
        json={"new_status": "READY_FOR_REVIEW"},
        headers=auth(prof_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "READY_FOR_REVIEW"

    # Constructor CANNOT approve
    resp = await ac.patch(
        f"/api/learning-objects/{LO_ID}/versions/{version_id}/status",
        json={"new_status": "APPROVED"},
        headers=auth(prof_token),
    )
    assert resp.status_code == 403

    # Reviewer approves
    resp = await ac.patch(
        f"/api/learning-objects/{LO_ID}/versions/{version_id}/status",
        json={"new_status": "APPROVED"},
        headers=auth(reviewer_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "APPROVED"

@pytest.mark.anyio
async def test_invalid_transition_returns_400(ac: AsyncClient, setup_rbac_data):
    """APPROVED → READY_FOR_REVIEW is not a valid transition."""
    prof_token = await login(ac, PROF_EMAIL, PROF_PASS)
    reviewer_token = await login(ac, REVIEWER_EMAIL, REVIEWER_PASS)
    admin_token = await login(ac, ADMIN_EMAIL, ADMIN_PASS)

    # Create → submit → approve
    resp = await ac.post(f"/api/learning-objects/{LO_ID}/versions", json=DRAFT_PAYLOAD, headers=auth(prof_token))
    version_id = resp.json()["id"]

    await ac.patch(f"/api/learning-objects/{LO_ID}/versions/{version_id}/status",
                 json={"new_status": "READY_FOR_REVIEW"}, headers=auth(prof_token))
    await ac.patch(f"/api/learning-objects/{LO_ID}/versions/{version_id}/status",
                 json={"new_status": "APPROVED"}, headers=auth(reviewer_token))

    # Try invalid: APPROVED → READY_FOR_REVIEW
    resp = await ac.patch(
        f"/api/learning-objects/{LO_ID}/versions/{version_id}/status",
        json={"new_status": "READY_FOR_REVIEW"},
        headers=auth(admin_token),
    )
    assert resp.status_code == 400

@pytest.mark.anyio
async def test_reviewer_rejection_with_feedback(ac: AsyncClient, setup_rbac_data):
    """Reviewer rejects READY_FOR_REVIEW → DRAFT with feedback stored."""
    prof_token = await login(ac, PROF_EMAIL, PROF_PASS)
    reviewer_token = await login(ac, REVIEWER_EMAIL, REVIEWER_PASS)

    resp = await ac.post(f"/api/learning-objects/{LO_ID}/versions", json=DRAFT_PAYLOAD, headers=auth(prof_token))
    version_id = resp.json()["id"]
    await ac.patch(f"/api/learning-objects/{LO_ID}/versions/{version_id}/status",
                 json={"new_status": "READY_FOR_REVIEW"}, headers=auth(prof_token))

    resp = await ac.patch(
        f"/api/learning-objects/{LO_ID}/versions/{version_id}/status",
        json={"new_status": "DRAFT", "feedback": "Stem is ambiguous, please reword."},
        headers=auth(reviewer_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "DRAFT"
    assert resp.json()["metadata_tags"]["review_feedback"] == "Stem is ambiguous, please reword."

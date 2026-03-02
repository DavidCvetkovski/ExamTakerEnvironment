"""
Stage 2 verification: RBAC middleware and status transition state machine.

Uses FastAPI's TestClient (ASGI, no real server needed).
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core.database import get_db, Base

# Use the real Docker Postgres for integration testing
DATABASE_URL = "postgresql+psycopg://postgres:password@localhost:5432/openvision"
engine = create_engine(DATABASE_URL)
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PROF_EMAIL, PROF_PASS = "prof@vu.nl", "profpass123"
REVIEWER_EMAIL, REVIEWER_PASS = "reviewer@vu.nl", "reviewpass123"
STUDENT_EMAIL, STUDENT_PASS = "student@vu.nl", "studpass123"
ADMIN_EMAIL, ADMIN_PASS = "admin@vu.nl", "adminpass123"
LO_ID = "1a8051f9-0d48-4949-89bd-1093ae697dc9"

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSession()
    
    from app.models.user import User, UserRole
    from app.models.item_bank import ItemBank
    from app.models.learning_object import LearningObject
    from app.core.security import hash_password
    import uuid

    admin = User(email=ADMIN_EMAIL, hashed_password=hash_password(ADMIN_PASS), role=UserRole.ADMIN)
    prof = User(email=PROF_EMAIL, hashed_password=hash_password(PROF_PASS), role=UserRole.CONSTRUCTOR)
    reviewer = User(email=REVIEWER_EMAIL, hashed_password=hash_password(REVIEWER_PASS), role=UserRole.REVIEWER)
    student = User(email=STUDENT_EMAIL, hashed_password=hash_password(STUDENT_PASS), role=UserRole.STUDENT)
    
    db.add_all([admin, prof, reviewer, student])
    db.commit()
    
    bank = ItemBank(name="Test", created_by=prof.id)
    db.add(bank)
    db.commit()
    
    lo = LearningObject(id=uuid.UUID(LO_ID), bank_id=bank.id, created_by=prof.id)
    db.add(lo)
    db.commit()
    
    yield
    db.close()


def login(email: str, password: str) -> str:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


PROF_EMAIL, PROF_PASS = "prof@vu.nl", "profpass123"
REVIEWER_EMAIL, REVIEWER_PASS = "reviewer@vu.nl", "reviewpass123"
STUDENT_EMAIL, STUDENT_PASS = "student@vu.nl", "studpass123"
ADMIN_EMAIL, ADMIN_PASS = "admin@vu.nl", "adminpass123"
LO_ID = "1a8051f9-0d48-4949-89bd-1093ae697dc9"

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

def test_unauthenticated_request_returns_401():
    resp = client.get(f"/api/learning-objects/{LO_ID}/versions")
    assert resp.status_code == 401


def test_authenticated_user_can_view_versions():
    token = login(PROF_EMAIL, PROF_PASS)
    resp = client.get(f"/api/learning-objects/{LO_ID}/versions", headers=auth(token))
    assert resp.status_code == 200


def test_student_cannot_create_item():
    token = login(STUDENT_EMAIL, STUDENT_PASS)
    resp = client.post(f"/api/learning-objects/{LO_ID}/versions", json=DRAFT_PAYLOAD, headers=auth(token))
    assert resp.status_code == 403


def test_reviewer_cannot_create_item():
    token = login(REVIEWER_EMAIL, REVIEWER_PASS)
    resp = client.post(f"/api/learning-objects/{LO_ID}/versions", json=DRAFT_PAYLOAD, headers=auth(token))
    assert resp.status_code == 403


def test_constructor_can_create_draft():
    token = login(PROF_EMAIL, PROF_PASS)
    resp = client.post(f"/api/learning-objects/{LO_ID}/versions", json=DRAFT_PAYLOAD, headers=auth(token))
    assert resp.status_code == 200
    assert resp.json()["status"] == "DRAFT"
    return resp.json()["id"]


def test_full_workflow_status_transitions():
    """Tests the full: DRAFT → READY_FOR_REVIEW → APPROVED lifecycle."""
    prof_token = login(PROF_EMAIL, PROF_PASS)
    reviewer_token = login(REVIEWER_EMAIL, REVIEWER_PASS)

    # Create a draft
    resp = client.post(f"/api/learning-objects/{LO_ID}/versions", json=DRAFT_PAYLOAD, headers=auth(prof_token))
    assert resp.status_code == 200
    version_id = resp.json()["id"]

    # Constructor submits for review
    resp = client.patch(
        f"/api/learning-objects/{LO_ID}/versions/{version_id}/status",
        json={"new_status": "READY_FOR_REVIEW"},
        headers=auth(prof_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "READY_FOR_REVIEW"

    # Constructor CANNOT approve
    resp = client.patch(
        f"/api/learning-objects/{LO_ID}/versions/{version_id}/status",
        json={"new_status": "APPROVED"},
        headers=auth(prof_token),
    )
    assert resp.status_code == 403

    # Reviewer approves
    resp = client.patch(
        f"/api/learning-objects/{LO_ID}/versions/{version_id}/status",
        json={"new_status": "APPROVED"},
        headers=auth(reviewer_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "APPROVED"


def test_invalid_transition_returns_400():
    """APPROVED → READY_FOR_REVIEW is not a valid transition."""
    prof_token = login(PROF_EMAIL, PROF_PASS)
    reviewer_token = login(REVIEWER_EMAIL, REVIEWER_PASS)
    admin_token = login(ADMIN_EMAIL, ADMIN_PASS)

    # Create → submit → approve
    resp = client.post(f"/api/learning-objects/{LO_ID}/versions", json=DRAFT_PAYLOAD, headers=auth(prof_token))
    version_id = resp.json()["id"]

    client.patch(f"/api/learning-objects/{LO_ID}/versions/{version_id}/status",
                 json={"new_status": "READY_FOR_REVIEW"}, headers=auth(prof_token))
    client.patch(f"/api/learning-objects/{LO_ID}/versions/{version_id}/status",
                 json={"new_status": "APPROVED"}, headers=auth(reviewer_token))

    # Try invalid: APPROVED → READY_FOR_REVIEW
    resp = client.patch(
        f"/api/learning-objects/{LO_ID}/versions/{version_id}/status",
        json={"new_status": "READY_FOR_REVIEW"},
        headers=auth(admin_token),
    )
    assert resp.status_code == 400


def test_reviewer_rejection_with_feedback():
    """Reviewer rejects READY_FOR_REVIEW → DRAFT with feedback stored."""
    prof_token = login(PROF_EMAIL, PROF_PASS)
    reviewer_token = login(REVIEWER_EMAIL, REVIEWER_PASS)

    resp = client.post(f"/api/learning-objects/{LO_ID}/versions", json=DRAFT_PAYLOAD, headers=auth(prof_token))
    version_id = resp.json()["id"]
    client.patch(f"/api/learning-objects/{LO_ID}/versions/{version_id}/status",
                 json={"new_status": "READY_FOR_REVIEW"}, headers=auth(prof_token))

    resp = client.patch(
        f"/api/learning-objects/{LO_ID}/versions/{version_id}/status",
        json={"new_status": "DRAFT", "feedback": "Stem is ambiguous, please reword."},
        headers=auth(reviewer_token),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "DRAFT"
    assert resp.json()["metadata_tags"]["review_feedback"] == "Stem is ambiguous, please reword."

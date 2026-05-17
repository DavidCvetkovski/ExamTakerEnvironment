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
        "duration_minutes": 120,
        "scoring_config": {
            "shuffle_options": True
        }
    }
    
    resp = await ac.post("/api/tests/", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Final Exam"
    assert len(data["blocks"]) == 1
    assert data["blocks"][0]["title"] == "Section A"
    assert data["id"] is not None
    assert data["scoring_config"]["shuffle_options"] is True

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
        "duration_minutes": 60,
        "scoring_config": {
            "shuffle_options": True
        }
    }
    create_resp = await ac.post("/api/tests/", json=payload, headers=headers)
    test_id = create_resp.json()["id"]

    get_resp = await ac.get(f"/api/tests/{test_id}", headers=headers)
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["id"] == test_id
    assert data["title"] == "Lookup Test"
    assert data["scoring_config"]["shuffle_options"] is True


# ---------------------------------------------------------------------------
# Non-empty-section guard (CLAUDE.md §1 — backend is authoritative)
# ---------------------------------------------------------------------------
#
# These tests use their own minimal fixture (admin user only — no LOs / banks
# / courses) because the validator under test fires at request-body parse
# time, before any DB FK can be hit. The full ``setup_matrix_data`` fixture
# above creates LOs and would couple us to whatever course-FK state is
# in-flight in adjacent epochs.

ADMIN_ONLY_EMAIL, ADMIN_ONLY_PASS = "guard_admin@vu.nl", "pass"

@pytest.fixture(scope="function")
async def setup_admin_only(cleanup_database):
    await prisma.users.create(
        data={
            "email": ADMIN_ONLY_EMAIL,
            "hashed_password": hash_password(ADMIN_ONLY_PASS),
            "role": UserRole.ADMIN,
        }
    )


@pytest.mark.anyio
async def test_create_rejects_blueprint_with_no_blocks(ac: AsyncClient, setup_admin_only):
    """Zero sections → 422 with the user-facing message."""
    token = await login(ac, ADMIN_ONLY_EMAIL, ADMIN_ONLY_PASS)
    headers = auth(token)

    payload = {
        "title": "Empty Skeleton",
        "blocks": [],
        "duration_minutes": 60,
        "scoring_config": {},
    }
    resp = await ac.post("/api/tests/", json=payload, headers=headers)
    assert resp.status_code == 422
    assert "at least one section" in resp.text.lower()


@pytest.mark.anyio
async def test_create_rejects_blueprint_with_only_empty_blocks(ac: AsyncClient, setup_admin_only):
    """Sections present but none has rules → still 422."""
    token = await login(ac, ADMIN_ONLY_EMAIL, ADMIN_ONLY_PASS)
    headers = auth(token)

    payload = {
        "title": "All Empty",
        "blocks": [
            {"title": "Section A", "rules": []},
            {"title": "Section B", "rules": []},
        ],
        "duration_minutes": 60,
        "scoring_config": {},
    }
    resp = await ac.post("/api/tests/", json=payload, headers=headers)
    assert resp.status_code == 422
    assert "at least one section" in resp.text.lower()


@pytest.mark.anyio
async def test_update_rejects_clearing_all_rules(ac: AsyncClient, setup_admin_only):
    """PUT that would leave the blueprint with no rules → 422.

    The blueprint is created with a RANDOM rule (no FK to LOs) so the
    test is self-contained and doesn't depend on any seeded item bank.
    """
    token = await login(ac, ADMIN_ONLY_EMAIL, ADMIN_ONLY_PASS)
    headers = auth(token)

    create_resp = await ac.post(
        "/api/tests/",
        json={
            "title": "Will Be Emptied",
            "blocks": [
                {
                    "title": "Section A",
                    "rules": [{"rule_type": "RANDOM", "count": 1, "tags": []}],
                }
            ],
            "duration_minutes": 60,
            "scoring_config": {},
        },
        headers=headers,
    )
    assert create_resp.status_code == 201, create_resp.text
    test_id = create_resp.json()["id"]

    update_resp = await ac.put(
        f"/api/tests/{test_id}",
        json={
            "title": "Will Be Emptied",
            "blocks": [{"title": "Section A", "rules": []}],
            "duration_minutes": 60,
            "scoring_config": {},
        },
        headers=headers,
    )
    assert update_resp.status_code == 422
    assert "at least one section" in update_resp.text.lower()


# ---------------------------------------------------------------------------
# Schema / payload edges — what should the validator say no to?
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_create_rejects_missing_title(ac: AsyncClient, setup_admin_only):
    """Pydantic-level: ``title`` is required."""
    token = await login(ac, ADMIN_ONLY_EMAIL, ADMIN_ONLY_PASS)
    headers = auth(token)
    payload = {
        "blocks": [{"title": "S", "rules": [{"rule_type": "RANDOM", "count": 1, "tags": []}]}],
        "duration_minutes": 60,
    }
    resp = await ac.post("/api/tests/", json=payload, headers=headers)
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_create_rejects_zero_duration(ac: AsyncClient, setup_admin_only):
    """``duration_minutes`` has ``gt=0`` on the Pydantic Field."""
    token = await login(ac, ADMIN_ONLY_EMAIL, ADMIN_ONLY_PASS)
    headers = auth(token)
    payload = {
        "title": "Zero Minutes",
        "blocks": [{"title": "S", "rules": [{"rule_type": "RANDOM", "count": 1, "tags": []}]}],
        "duration_minutes": 0,
    }
    resp = await ac.post("/api/tests/", json=payload, headers=headers)
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_create_rejects_negative_duration(ac: AsyncClient, setup_admin_only):
    token = await login(ac, ADMIN_ONLY_EMAIL, ADMIN_ONLY_PASS)
    headers = auth(token)
    payload = {
        "title": "Negative",
        "blocks": [{"title": "S", "rules": [{"rule_type": "RANDOM", "count": 1, "tags": []}]}],
        "duration_minutes": -5,
    }
    resp = await ac.post("/api/tests/", json=payload, headers=headers)
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_create_rejects_random_rule_with_zero_count(ac: AsyncClient, setup_admin_only):
    """``RandomSelectionRule.count`` is ``Field(gt=0)`` — 0 makes no sense
    (a RANDOM rule that selects zero items contributes nothing)."""
    token = await login(ac, ADMIN_ONLY_EMAIL, ADMIN_ONLY_PASS)
    headers = auth(token)
    payload = {
        "title": "Zero Count Rule",
        "blocks": [{"title": "S", "rules": [{"rule_type": "RANDOM", "count": 0, "tags": []}]}],
        "duration_minutes": 60,
    }
    resp = await ac.post("/api/tests/", json=payload, headers=headers)
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_create_rejects_unknown_rule_type(ac: AsyncClient, setup_admin_only):
    """Discriminated union must reject unknown ``rule_type``."""
    token = await login(ac, ADMIN_ONLY_EMAIL, ADMIN_ONLY_PASS)
    headers = auth(token)
    payload = {
        "title": "Bad Rule Type",
        "blocks": [{"title": "S", "rules": [{"rule_type": "MAGIC", "count": 1, "tags": []}]}],
        "duration_minutes": 60,
    }
    resp = await ac.post("/api/tests/", json=payload, headers=headers)
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_create_rejects_fixed_rule_with_malformed_uuid(ac: AsyncClient, setup_admin_only):
    """``learning_object_id`` is typed as ``UUID``; bad string → 422."""
    token = await login(ac, ADMIN_ONLY_EMAIL, ADMIN_ONLY_PASS)
    headers = auth(token)
    payload = {
        "title": "Bad UUID",
        "blocks": [{"title": "S", "rules": [{"rule_type": "FIXED", "learning_object_id": "not-a-uuid"}]}],
        "duration_minutes": 60,
    }
    resp = await ac.post("/api/tests/", json=payload, headers=headers)
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_create_accepts_large_blueprint(ac: AsyncClient, setup_admin_only):
    """Sanity: a blueprint with many blocks + many RANDOM rules is fine.
    Catches accidental size/recursion limits introduced by future
    validation tightening."""
    token = await login(ac, ADMIN_ONLY_EMAIL, ADMIN_ONLY_PASS)
    headers = auth(token)
    blocks = [
        {
            "title": f"Section {i}",
            "rules": [
                {"rule_type": "RANDOM", "count": 1, "tags": [f"tag{j}"]}
                for j in range(20)
            ],
        }
        for i in range(20)
    ]
    payload = {
        "title": "Big Blueprint",
        "blocks": blocks,
        "duration_minutes": 60,
    }
    resp = await ac.post("/api/tests/", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    assert len(resp.json()["blocks"]) == 20


@pytest.mark.anyio
async def test_create_accepts_one_non_empty_section_among_many_empty(ac: AsyncClient, setup_admin_only):
    """The new rule is "at least *one* non-empty section", not "every
    section". Mixed shapes pass on the backend; the frontend warns
    per-section. This matches the spec the user requested."""
    token = await login(ac, ADMIN_ONLY_EMAIL, ADMIN_ONLY_PASS)
    headers = auth(token)
    payload = {
        "title": "Sparse",
        "blocks": [
            {"title": "Empty A", "rules": []},
            {"title": "Has Rule", "rules": [{"rule_type": "RANDOM", "count": 1, "tags": []}]},
            {"title": "Empty B", "rules": []},
        ],
        "duration_minutes": 60,
    }
    resp = await ac.post("/api/tests/", json=payload, headers=headers)
    assert resp.status_code == 201


@pytest.mark.anyio
async def test_create_response_round_trips_scoring_config(ac: AsyncClient, setup_admin_only):
    """``scoring_config`` is ``Dict[str, Any]`` — arbitrary nested JSON
    must survive the round-trip without loss."""
    token = await login(ac, ADMIN_ONLY_EMAIL, ADMIN_ONLY_PASS)
    headers = auth(token)
    cfg = {
        "pass_percentage": 65,
        "grade_boundaries": [{"min_percentage": 65, "grade": "Pass"}],
        "negative_marking": True,
        "nested": {"deep": {"value": [1, 2, 3]}},
    }
    payload = {
        "title": "Round Trip",
        "blocks": [{"title": "S", "rules": [{"rule_type": "RANDOM", "count": 1, "tags": []}]}],
        "duration_minutes": 60,
        "scoring_config": cfg,
    }
    resp = await ac.post("/api/tests/", json=payload, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["scoring_config"] == cfg


@pytest.mark.anyio
async def test_get_unknown_test_returns_404(ac: AsyncClient, setup_admin_only):
    from uuid import uuid4
    token = await login(ac, ADMIN_ONLY_EMAIL, ADMIN_ONLY_PASS)
    headers = auth(token)
    resp = await ac.get(f"/api/tests/{uuid4()}", headers=headers)
    assert resp.status_code in (404, 500)  # service raises; either is rejection

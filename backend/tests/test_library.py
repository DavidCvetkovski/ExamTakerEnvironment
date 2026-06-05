import pytest
from httpx import AsyncClient
from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole
from app.models.item_version import ItemStatus, QuestionType
import prisma as prisma_lib


async def _attach_draft_version(lo_id: str, user_id: str) -> None:
    """The list endpoint only returns LOs that have at least one
    item_version. Tests that bypass POST /learning-objects must seed one."""
    await prisma.item_versions.create(data={
        "learning_object_id": lo_id,
        "version_number": 1,
        "status": ItemStatus.DRAFT,
        "question_type": QuestionType.MULTIPLE_CHOICE,
        "content": prisma_lib.Json({"text": "Q"}),
        "options": prisma_lib.Json([]),
        "created_by": user_id,
    })

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
    body = response.json()
    assert isinstance(body["items"], list)
    assert body["total"] == len(body["items"])

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
    data = list_res.json()["items"]
    assert len(data) > 0
    
    # Find the one we just created
    item = next((i for i in data if i["id"] == lo_id), None)
    assert item is not None
    assert item["latest_version_number"] == 1
    assert item["latest_status"] == "DRAFT"
    assert item["latest_question_type"] == "MULTIPLE_CHOICE"


# ---------------------------------------------------------------------------
# Epoch 8.7 Stage 2 — list response includes course fields
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_list_includes_course_fields_when_assigned(ac: AsyncClient, setup_library_data):
    """Stage 7 verification gate: list response carries course_id /
    course_title / course_code for LOs that have been course-assigned."""
    token = await login(ac, LIB_EMAIL, LIB_PASS)
    headers = auth(token)
    user = setup_library_data["user"]

    bank = await prisma.item_banks.create(data={"name": "B", "created_by": user.id})
    course = await prisma.courses.create(
        data={"code": "CS-LIB", "title": "Library Course", "created_by": user.id}
    )
    lo = await prisma.learning_objects.create(
        data={"bank_id": bank.id, "created_by": user.id, "course_id": course.id}
    )
    await _attach_draft_version(lo.id, user.id)

    resp = await ac.get("/api/learning-objects", headers=headers)
    assert resp.status_code == 200
    row = next(item for item in resp.json()["items"] if item["id"] == lo.id)
    assert row["course_id"] == course.id
    assert row["course_title"] == "Library Course"
    assert row["course_code"] == "CS-LIB"


@pytest.mark.anyio
async def test_list_course_fields_null_when_unassigned(ac: AsyncClient, setup_library_data):
    """LOs with no course_id must report null fields, not raise / not omit
    the keys (frontend reads them unconditionally)."""
    token = await login(ac, LIB_EMAIL, LIB_PASS)
    headers = auth(token)
    user = setup_library_data["user"]

    bank = await prisma.item_banks.create(data={"name": "B2", "created_by": user.id})
    lo = await prisma.learning_objects.create(
        data={"bank_id": bank.id, "created_by": user.id}
    )
    await _attach_draft_version(lo.id, user.id)
    resp = await ac.get("/api/learning-objects", headers=headers)
    assert resp.status_code == 200
    row = next(item for item in resp.json()["items"] if item["id"] == lo.id)
    assert row["course_id"] is None
    assert row["course_title"] is None
    assert row["course_code"] is None


# ---------------------------------------------------------------------------
# Epoch 15 #25 — pagination envelope (skip / limit / total)
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_learning_objects_pagination_windows(ac: AsyncClient, setup_library_data):
    """skip/limit page through the list without overlap, and total reports the
    full count regardless of the window. The capped limit is enforced (422)."""
    token = await login(ac, LIB_EMAIL, LIB_PASS)
    headers = auth(token)
    user = setup_library_data["user"]

    bank = await prisma.item_banks.create(data={"name": "PG", "created_by": user.id})
    for _ in range(3):
        lo = await prisma.learning_objects.create(
            data={"bank_id": bank.id, "created_by": user.id}
        )
        await _attach_draft_version(lo.id, user.id)

    # Full set: envelope shape + total.
    full = (await ac.get("/api/learning-objects", headers=headers)).json()
    assert full["total"] == 3
    assert full["skip"] == 0 and full["limit"] == 50
    assert len(full["items"]) == 3

    # First window of 2.
    page1 = (await ac.get("/api/learning-objects?skip=0&limit=2", headers=headers)).json()
    assert page1["total"] == 3
    assert len(page1["items"]) == 2

    # Second window holds the remainder, and the two windows are disjoint and
    # reconstruct the full ordered list (pagination must not reorder).
    page2 = (await ac.get("/api/learning-objects?skip=2&limit=2", headers=headers)).json()
    assert page2["total"] == 3
    assert len(page2["items"]) == 1
    ids = [i["id"] for i in page1["items"]] + [i["id"] for i in page2["items"]]
    assert ids == [i["id"] for i in full["items"]]
    assert len(set(ids)) == 3

    # Over-cap limit is rejected by query validation (le=200).
    capped = await ac.get("/api/learning-objects?limit=500", headers=headers)
    assert capped.status_code == 422

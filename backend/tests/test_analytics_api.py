from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.dependencies import get_current_user
from app.main import app
from app.models.user import UserRole
from app.api.endpoints import analytics as analytics_endpoints


def _auth_override(user: SimpleNamespace):
    async def _override():
        return user

    return _override


@pytest.fixture
def analytics_ids() -> dict[str, str]:
    return {
        "test_id": str(uuid4()),
        "learning_object_id": str(uuid4()),
        "owner_id": str(uuid4()),
        "other_id": str(uuid4()),
    }


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


async def _allow_access(*args, **kwargs):
    return None


@pytest.mark.anyio
async def test_student_cannot_access_analytics(ac, monkeypatch, analytics_ids):
    app.dependency_overrides[get_current_user] = _auth_override(
        SimpleNamespace(id=analytics_ids["owner_id"], role=UserRole.STUDENT.value)
    )

    resp = await ac.get(f"/api/analytics/tests/{analytics_ids['test_id']}")
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_constructor_must_own_test(ac, monkeypatch, analytics_ids):
    async def deny_access(*args, **kwargs):
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="You do not have access to this test's analytics.")

    monkeypatch.setattr(
        analytics_endpoints,
        "_require_test_access",
        deny_access,
    )
    app.dependency_overrides[get_current_user] = _auth_override(
        SimpleNamespace(id=analytics_ids["other_id"], role=UserRole.CONSTRUCTOR.value)
    )

    resp = await ac.get(f"/api/analytics/tests/{analytics_ids['test_id']}")
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_get_test_analytics_returns_404_when_no_bundle(ac, monkeypatch, analytics_ids):
    async def fake_bundle(*args, **kwargs):
        return None

    monkeypatch.setattr(
        analytics_endpoints,
        "_require_test_access",
        _allow_access,
    )
    monkeypatch.setattr(
        analytics_endpoints.psychometrics_service,
        "get_latest_test_analytics_bundle",
        fake_bundle,
    )
    app.dependency_overrides[get_current_user] = _auth_override(
        SimpleNamespace(id=analytics_ids["owner_id"], role=UserRole.CONSTRUCTOR.value)
    )

    resp = await ac.get(f"/api/analytics/tests/{analytics_ids['test_id']}")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "No analytics computed yet."


@pytest.mark.anyio
async def test_stage4_endpoints_return_expected_shapes(ac, monkeypatch, analytics_ids):
    async def fake_bundle(*args, **kwargs):
        return {
            "test": {
                "test_definition_id": analytics_ids["test_id"],
                "total_sessions": 12,
                "distribution": [{"range": "50-60", "min": 50.0, "max": 60.0, "count": 3}],
                "mean": 61.2,
                "median": 60.0,
                "std_dev": 9.1,
                "min_score": 35.0,
                "max_score": 89.0,
                "pass_rate": 75.0,
                "pass_count": 9,
                "fail_count": 3,
                "cronbach_alpha": 0.71,
                "sem": 4.9,
                "n_items": 6,
                "cut_score": 55.0,
                "computed_at": None,
                "is_stale": False,
                "cut_score_analysis": [],
            },
            "items": [
                {
                    "learning_object_id": analytics_ids["learning_object_id"],
                    "item_version_id": str(uuid4()),
                    "version_number": 2,
                    "question_type": "MULTIPLE_CHOICE",
                    "p_value": 0.42,
                    "d_value": 0.28,
                    "n_responses": 12,
                    "mean_score": 0.42,
                    "points_possible": 1.0,
                    "distractors": [],
                    "flags": [],
                    "computed_at": None,
                }
            ],
            "flagged_items_count": 0,
        }

    async def fake_history(*args, **kwargs):
        return {
            "learning_object_id": analytics_ids["learning_object_id"],
            "entries": [
                {
                    "item_version_id": str(uuid4()),
                    "version_number": 1,
                    "test_definition_id": analytics_ids["test_id"],
                    "test_title": "Epoch 7 Demo",
                    "p_value": 0.42,
                    "d_value": 0.28,
                    "n_responses": 12,
                    "computed_at": None,
                    "flags": [],
                }
            ],
        }

    async def fake_flagged(*args, **kwargs):
        return []

    async def fake_scenarios(*args, **kwargs):
        return [{"cut_score": 55.0, "pass_count": 9, "fail_count": 3, "pass_rate": 75.0}]

    monkeypatch.setattr(
        analytics_endpoints,
        "_require_test_access",
        _allow_access,
    )
    monkeypatch.setattr(
        analytics_endpoints,
        "_require_learning_object_access",
        _allow_access,
    )
    monkeypatch.setattr(
        analytics_endpoints.psychometrics_service,
        "get_latest_test_analytics_bundle",
        fake_bundle,
    )
    monkeypatch.setattr(
        analytics_endpoints.psychometrics_service,
        "recompute_test_analytics_bundle",
        fake_bundle,
    )
    monkeypatch.setattr(
        analytics_endpoints.psychometrics_service,
        "get_item_history_entries",
        fake_history,
    )
    monkeypatch.setattr(
        analytics_endpoints.psychometrics_service,
        "list_flagged_items_for_test",
        fake_flagged,
    )
    monkeypatch.setattr(
        analytics_endpoints.psychometrics_service,
        "get_cut_score_scenarios",
        fake_scenarios,
    )
    app.dependency_overrides[get_current_user] = _auth_override(
        SimpleNamespace(id=analytics_ids["owner_id"], role=UserRole.CONSTRUCTOR.value)
    )

    bundle_resp = await ac.get(f"/api/analytics/tests/{analytics_ids['test_id']}")
    recompute_resp = await ac.post(f"/api/analytics/tests/{analytics_ids['test_id']}/recompute")
    flagged_resp = await ac.get(f"/api/analytics/tests/{analytics_ids['test_id']}/flagged-items")
    history_resp = await ac.get(f"/api/analytics/items/{analytics_ids['learning_object_id']}/history")
    scenarios_resp = await ac.get(
        f"/api/analytics/tests/{analytics_ids['test_id']}/cut-score-scenarios",
        params={"cuts": "45,55"},
    )

    assert bundle_resp.status_code == 200
    assert recompute_resp.status_code == 200
    assert flagged_resp.status_code == 200
    assert history_resp.status_code == 200
    assert scenarios_resp.status_code == 200

    assert bundle_resp.json()["test"]["test_definition_id"] == analytics_ids["test_id"]
    assert isinstance(flagged_resp.json(), list)
    assert history_resp.json()["entries"][0]["test_title"] == "Epoch 7 Demo"
    assert scenarios_resp.json()[0]["cut_score"] == 55.0

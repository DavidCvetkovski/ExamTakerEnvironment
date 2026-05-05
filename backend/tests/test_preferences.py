from types import SimpleNamespace

import pytest

from app.core.dependencies import get_current_user
from app.main import app


@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


def _auth_override(user: SimpleNamespace):
    async def _override():
        return user

    return _override


@pytest.mark.anyio
async def test_patch_theme_preference_happy_path(ac):
    user = SimpleNamespace(id="00000000-0000-0000-0000-000000000001", role="STUDENT")
    app.dependency_overrides[get_current_user] = _auth_override(user)

    from app.core.prisma_db import prisma

    await prisma.users.create(
        data={
            "id": user.id,
            "email": "theme.user@vu.nl",
            "hashed_password": "hashed",
            "role": "STUDENT",
            "is_active": True,
            "provision_time_multiplier": 1.0,
        }
    )

    response = await ac.patch("/api/users/me/preferences/theme", json={"theme": "warm"})

    assert response.status_code == 200
    assert response.json() == {"theme": "warm"}

    stored = await prisma.users.find_unique(where={"id": user.id})
    assert stored is not None
    assert stored.theme_preference == "warm"


@pytest.mark.anyio
async def test_patch_theme_preference_rejects_invalid_value(ac):
    user = SimpleNamespace(id="00000000-0000-0000-0000-000000000002", role="STUDENT")
    app.dependency_overrides[get_current_user] = _auth_override(user)

    response = await ac.patch("/api/users/me/preferences/theme", json={"theme": "red"})

    assert response.status_code == 422


@pytest.mark.anyio
async def test_patch_theme_preference_requires_auth(ac):
    response = await ac.patch("/api/users/me/preferences/theme", json={"theme": "dark"})

    assert response.status_code == 401

"""Epoch 9 — account settings: secure password change, full session
invalidation (token_version), sign-out-everywhere, and self-deactivation."""

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.prisma_db import prisma


@pytest.fixture
async def ac():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True)
async def use_cleanup(cleanup_database):
    """Use the central cleanup fixture (wipes tables between tests)."""
    pass


async def _register(ac: AsyncClient, email="victim@vu.nl", password="originalpw123", role="STUDENT"):
    resp = await ac.post("/api/auth/register", json={"email": email, "password": password, "role": role})
    assert resp.status_code == 201
    return resp.json()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# F1 — change password
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_change_password_happy_path(ac: AsyncClient):
    reg = await _register(ac)
    token = reg["access_token"]

    resp = await ac.post(
        "/api/auth/change-password",
        json={"current_password": "originalpw123", "new_password": "brandnewpw456"},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()

    # New password logs in; old one does not.
    new_login = await ac.post("/api/auth/login", json={"email": "victim@vu.nl", "password": "brandnewpw456"})
    assert new_login.status_code == 200
    old_login = await ac.post("/api/auth/login", json={"email": "victim@vu.nl", "password": "originalpw123"})
    assert old_login.status_code == 401


@pytest.mark.anyio
async def test_change_password_wrong_current(ac: AsyncClient):
    reg = await _register(ac)
    resp = await ac.post(
        "/api/auth/change-password",
        json={"current_password": "WRONG", "new_password": "brandnewpw456"},
        headers=_auth(reg["access_token"]),
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_change_password_same_as_current(ac: AsyncClient):
    reg = await _register(ac)
    resp = await ac.post(
        "/api/auth/change-password",
        json={"current_password": "originalpw123", "new_password": "originalpw123"},
        headers=_auth(reg["access_token"]),
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_change_password_too_short(ac: AsyncClient):
    reg = await _register(ac)
    resp = await ac.post(
        "/api/auth/change-password",
        json={"current_password": "originalpw123", "new_password": "short"},
        headers=_auth(reg["access_token"]),
    )
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_change_password_requires_auth(ac: AsyncClient):
    resp = await ac.post(
        "/api/auth/change-password",
        json={"current_password": "x", "new_password": "yyyyyyyy"},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# F2 — token_version invalidation spine
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_old_access_token_dies_after_password_change(ac: AsyncClient):
    reg = await _register(ac)
    old_token = reg["access_token"]

    # The token works before the change.
    assert (await ac.get("/api/auth/me", headers=_auth(old_token))).status_code == 200

    changed = await ac.post(
        "/api/auth/change-password",
        json={"current_password": "originalpw123", "new_password": "brandnewpw456"},
        headers=_auth(old_token),
    )
    assert changed.status_code == 200
    fresh_token = changed.json()["access_token"]

    # Old token is now stale (tv mismatch) → 401; the re-minted one works.
    assert (await ac.get("/api/auth/me", headers=_auth(old_token))).status_code == 401
    assert (await ac.get("/api/auth/me", headers=_auth(fresh_token))).status_code == 200


@pytest.mark.anyio
async def test_old_refresh_cookie_dies_after_password_change(ac: AsyncClient):
    reg = await _register(ac)
    login = await ac.post("/api/auth/login", json={"email": "victim@vu.nl", "password": "originalpw123"})
    old_refresh = login.cookies.get("refresh_token")

    await ac.post(
        "/api/auth/change-password",
        json={"current_password": "originalpw123", "new_password": "brandnewpw456"},
        headers=_auth(login.json()["access_token"]),
    )

    refreshed = await ac.post("/api/auth/refresh", cookies={"refresh_token": old_refresh})
    assert refreshed.status_code == 401


# ---------------------------------------------------------------------------
# F4 — sign out everywhere + self-deactivation
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_logout_all_wrong_password(ac: AsyncClient):
    reg = await _register(ac)
    resp = await ac.post(
        "/api/auth/logout-all",
        json={"password": "WRONG"},
        headers=_auth(reg["access_token"]),
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_logout_all_invalidates_other_sessions(ac: AsyncClient):
    reg = await _register(ac)
    # A second device's token (independent login).
    other = await ac.post("/api/auth/login", json={"email": "victim@vu.nl", "password": "originalpw123"})
    other_token = other.json()["access_token"]

    resp = await ac.post(
        "/api/auth/logout-all",
        json={"password": "originalpw123"},
        headers=_auth(reg["access_token"]),
    )
    assert resp.status_code == 200
    current_token = resp.json()["access_token"]

    # Other device dies; the initiating session keeps a fresh token.
    assert (await ac.get("/api/auth/me", headers=_auth(other_token))).status_code == 401
    assert (await ac.get("/api/auth/me", headers=_auth(current_token))).status_code == 200


@pytest.mark.anyio
async def test_admin_cannot_self_deactivate(ac: AsyncClient):
    # Mint the ADMIN directly — public /register can no longer self-assign a
    # role (privilege-escalation guard), so privileged test users are seeded via
    # the ORM and then authenticated normally.
    from app.core.security import hash_password
    from app.models.user import UserRole

    await prisma.users.create(
        data={
            "email": "admin@vu.nl",
            "hashed_password": hash_password("originalpw123"),
            "role": UserRole.ADMIN.value,
        }
    )
    login = await ac.post("/api/auth/login", json={"email": "admin@vu.nl", "password": "originalpw123"})
    assert login.status_code == 200
    resp = await ac.post(
        "/api/users/me/deactivate",
        json={"password": "originalpw123"},
        headers=_auth(login.json()["access_token"]),
    )
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_self_deactivate_wrong_password(ac: AsyncClient):
    reg = await _register(ac)
    resp = await ac.post(
        "/api/users/me/deactivate",
        json={"password": "WRONG"},
        headers=_auth(reg["access_token"]),
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_self_deactivate_happy_path(ac: AsyncClient):
    reg = await _register(ac)
    token = reg["access_token"]

    resp = await ac.post(
        "/api/users/me/deactivate",
        json={"password": "originalpw123"},
        headers=_auth(token),
    )
    assert resp.status_code == 204

    # Session dies immediately — the token_version bump invalidates the existing
    # token (401) before the is_active check is even reached. Re-login is barred
    # by the deactivated account (403).
    assert (await ac.get("/api/auth/me", headers=_auth(token))).status_code == 401
    relogin = await ac.post("/api/auth/login", json={"email": "victim@vu.nl", "password": "originalpw123"})
    assert relogin.status_code == 403

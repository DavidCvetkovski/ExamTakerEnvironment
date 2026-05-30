"""Epoch 10 — self-service accessibility preferences."""

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
    pass


async def _register(ac, email="a11y@vu.nl", password="originalpw123"):
    resp = await ac.post("/api/auth/register", json={"email": email, "password": password, "role": "STUDENT"})
    assert resp.status_code == 201
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.anyio
async def test_patch_accessibility_happy_path(ac: AsyncClient):
    token = await _register(ac)
    resp = await ac.patch(
        "/api/users/me/preferences/accessibility",
        json={"high_contrast": True, "dyslexia_font": True, "text_scale": "lg"},
        headers=_auth(token),
    )
    assert resp.status_code == 200
    assert resp.json() == {"high_contrast": True, "dyslexia_font": True, "text_scale": "lg"}


@pytest.mark.anyio
async def test_partial_update_leaves_others_unchanged(ac: AsyncClient):
    token = await _register(ac)
    await ac.patch(
        "/api/users/me/preferences/accessibility",
        json={"high_contrast": True, "text_scale": "xl"},
        headers=_auth(token),
    )
    # Only flip dyslexia_font; the others must persist.
    resp = await ac.patch(
        "/api/users/me/preferences/accessibility",
        json={"dyslexia_font": True},
        headers=_auth(token),
    )
    assert resp.json() == {"high_contrast": True, "dyslexia_font": True, "text_scale": "xl"}


@pytest.mark.anyio
async def test_text_scale_default_clears_override(ac: AsyncClient):
    token = await _register(ac)
    await ac.patch(
        "/api/users/me/preferences/accessibility",
        json={"text_scale": "lg"},
        headers=_auth(token),
    )
    resp = await ac.patch(
        "/api/users/me/preferences/accessibility",
        json={"text_scale": "default"},
        headers=_auth(token),
    )
    assert resp.json()["text_scale"] is None


@pytest.mark.anyio
async def test_invalid_text_scale_rejected(ac: AsyncClient):
    token = await _register(ac)
    resp = await ac.patch(
        "/api/users/me/preferences/accessibility",
        json={"text_scale": "humongous"},
        headers=_auth(token),
    )
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_me_surfaces_accessibility(ac: AsyncClient):
    token = await _register(ac)
    await ac.patch(
        "/api/users/me/preferences/accessibility",
        json={"high_contrast": True},
        headers=_auth(token),
    )
    me = await ac.get("/api/auth/me", headers=_auth(token))
    assert me.status_code == 200
    assert me.json()["accessibility"]["high_contrast"] is True


@pytest.mark.anyio
async def test_requires_auth(ac: AsyncClient):
    resp = await ac.patch("/api/users/me/preferences/accessibility", json={"high_contrast": True})
    assert resp.status_code == 401

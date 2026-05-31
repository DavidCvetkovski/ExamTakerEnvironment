"""Tests for QTI 2.1 export/import: round-trip, unsupported types, safety, RBAC."""

import uuid

import pytest
from httpx import AsyncClient
from prisma import Json

from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole
from app.services.qti import mappers, package


@pytest.fixture(autouse=True)
async def use_cleanup(cleanup_database):
    pass


async def _make_user(email, role, password="pass1234"):
    return await prisma.users.create(
        data={"email": email, "hashed_password": hash_password(password),
              "role": role.value, "is_active": True}
    )


async def _login(ac, email, password="pass1234"):
    resp = await ac.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _tiptap(text):
    return {"type": "doc", "content": [{"type": "paragraph",
            "content": [{"type": "text", "text": text}]}]}


async def _bank(name="QTI bank"):
    return await prisma.item_banks.create(data={"name": f"{name}-{uuid.uuid4().hex[:6]}"})


async def _make_item(bank_id, question_type, prompt, options):
    lo = await prisma.learning_objects.create(data={"bank_id": bank_id})
    await prisma.item_versions.create(
        data={"learning_object_id": lo.id, "version_number": 1, "status": "APPROVED",
              "question_type": question_type, "content": Json(_tiptap(prompt)),
              "options": Json(options)}
    )
    return lo


# --- unit: mapper round-trip --------------------------------------------

def test_mapper_round_trip_multiple_choice():
    options = {"question_type": "MULTIPLE_CHOICE", "choices": [
        {"id": "a", "text": "3", "is_correct": False, "weight": 1.0},
        {"id": "b", "text": "4", "is_correct": True, "weight": 1.0},
    ]}
    xml = mappers.item_to_xml(
        identifier="item-1", title="Q", question_type="MULTIPLE_CHOICE",
        content=_tiptap("What is 2+2?"), options=options, include_correct=True,
    )
    root = package.parse_xml_safely(xml.encode())
    mapped = mappers.xml_to_item(root)
    assert mapped["question_type"] == "MULTIPLE_CHOICE"
    choices = mapped["options"]["choices"]
    assert [c["text"] for c in choices] == ["3", "4"]
    assert [c["is_correct"] for c in choices] == [False, True]


def test_mapper_rejects_unsupported_interaction():
    xml = (
        '<assessmentItem xmlns="http://www.imsglobal.org/xsd/imsqti_v2p1" '
        'identifier="h1" title="H"><itemBody><hotspotInteraction '
        'responseIdentifier="RESPONSE"/></itemBody></assessmentItem>'
    )
    root = package.parse_xml_safely(xml.encode())
    with pytest.raises(mappers.UnsupportedInteraction):
        mappers.xml_to_item(root)


def test_parser_rejects_doctype():
    evil = b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><assessmentItem/>'
    with pytest.raises(package.QtiPackageError):
        package.parse_xml_safely(evil)


# --- API: export then import (round-trip) -------------------------------

@pytest.mark.anyio
async def test_export_import_round_trip(ac: AsyncClient):
    await _make_user("c@vu.nl", UserRole.CONSTRUCTOR)
    token = await _login(ac, "c@vu.nl")
    src = await _bank("src")
    await _make_item(src.id, "MULTIPLE_CHOICE", "Pick one", {
        "question_type": "MULTIPLE_CHOICE", "choices": [
            {"id": "a", "text": "no", "is_correct": False, "weight": 1.0},
            {"id": "b", "text": "yes", "is_correct": True, "weight": 1.0},
        ]})
    await _make_item(src.id, "ESSAY", "Discuss",
                     {"question_type": "ESSAY", "min_words": 10, "max_words": 200})

    export = await ac.get(f"/api/qti/items/export?bank_id={src.id}", headers=_auth(token))
    assert export.status_code == 200
    assert export.headers["content-type"] == "application/zip"
    zip_bytes = export.content

    dest = await _bank("dest")
    imp = await ac.post(
        "/api/qti/import", headers=_auth(token),
        files={"file": ("pkg.zip", zip_bytes, "application/zip")},
        data={"bank_id": str(dest.id), "commit": "true"},
    )
    assert imp.status_code == 200
    body = imp.json()
    assert body["committed"] is True
    assert body["success_items"] == 2 and body["error_items"] == 0
    created = await prisma.learning_objects.find_many(
        where={"bank_id": dest.id}, include={"item_versions": True}
    )
    assert len(created) == 2
    types = {v.question_type for o in created for v in o.item_versions}
    assert types == {"MULTIPLE_CHOICE", "ESSAY"}


@pytest.mark.anyio
async def test_import_dry_run_does_not_persist(ac: AsyncClient):
    await _make_user("c@vu.nl", UserRole.CONSTRUCTOR)
    token = await _login(ac, "c@vu.nl")
    src = await _bank("dry")
    await _make_item(src.id, "MULTIPLE_CHOICE", "Q", {
        "question_type": "MULTIPLE_CHOICE",
        "choices": [{"id": "a", "text": "x", "is_correct": True, "weight": 1.0}]})
    zip_bytes = (await ac.get(f"/api/qti/items/export?bank_id={src.id}", headers=_auth(token))).content

    dest = await _bank("drydest")
    imp = await ac.post(
        "/api/qti/import", headers=_auth(token),
        files={"file": ("pkg.zip", zip_bytes, "application/zip")},
        data={"bank_id": str(dest.id), "commit": "false"},
    )
    assert imp.status_code == 200
    assert imp.json()["committed"] is False
    assert await prisma.learning_objects.count(where={"bank_id": dest.id}) == 0


@pytest.mark.anyio
async def test_import_reports_unsupported_item(ac: AsyncClient):
    await _make_user("c@vu.nl", UserRole.CONSTRUCTOR)
    token = await _login(ac, "c@vu.nl")
    xml = (
        b'<assessmentItem xmlns="http://www.imsglobal.org/xsd/imsqti_v2p1" '
        b'identifier="hot-1" title="Hot"><itemBody><hotspotInteraction '
        b'responseIdentifier="RESPONSE"/></itemBody></assessmentItem>'
    )
    imp = await ac.post(
        "/api/qti/import", headers=_auth(token),
        files={"file": ("item.xml", xml, "text/xml")},
        data={"commit": "false"},
    )
    assert imp.status_code == 200
    body = imp.json()
    assert body["error_items"] == 1
    assert "Unsupported interaction" in body["items"][0]["message"]


@pytest.mark.anyio
async def test_qti_export_forbidden_for_student(ac: AsyncClient):
    await _make_user("stu@vu.nl", UserRole.STUDENT)
    token = await _login(ac, "stu@vu.nl")
    resp = await ac.get(f"/api/qti/items/export?bank_id={uuid.uuid4()}", headers=_auth(token))
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_qti_import_forbidden_for_student(ac: AsyncClient):
    await _make_user("stu@vu.nl", UserRole.STUDENT)
    token = await _login(ac, "stu@vu.nl")
    resp = await ac.post(
        "/api/qti/import", headers=_auth(token),
        files={"file": ("x.xml", b"<assessmentItem/>", "text/xml")},
        data={"commit": "false"},
    )
    assert resp.status_code == 403

"""Tests for QTI 2.1 export/import: round-trip, unsupported types, safety, RBAC."""

import uuid

import pytest
from prisma import Json

from app.core.prisma_db import prisma
from app.services.qti import mappers, package
from tests.conftest import auth_headers_for_role, make_user


async def _bank(name="QTI bank"):
    return await prisma.item_banks.create(data={"name": f"{name}-{uuid.uuid4().hex[:6]}"})


async def _make_item(bank_id, question_type, prompt, options):
    lo = await prisma.learning_objects.create(data={"bank_id": bank_id})
    content = {"question": {"prompt": prompt}, "options": options}
    await prisma.item_versions.create(
        data={
            "learning_object_id": lo.id,
            "version_number": 1,
            "status": "APPROVED",
            "question_type": question_type,
            "content": Json(content),
            "options": Json(options),
        }
    )
    return lo


# --- unit: mapper round-trip --------------------------------------------

def test_mapper_round_trip_multiple_choice():
    content = {
        "question": {"prompt": "What is 2+2?"},
        "options": [
            {"id": "a", "text": "3", "is_correct": False},
            {"id": "b", "text": "4", "is_correct": True},
        ],
    }
    xml = mappers.item_to_xml(
        identifier="item-1", title="Q", question_type="MULTIPLE_CHOICE",
        content=content, include_correct=True,
    )
    root = package.parse_xml_safely(xml.encode())
    mapped = mappers.xml_to_item(root)
    assert mapped["question_type"] == "MULTIPLE_CHOICE"
    opts = mapped["content"]["options"]
    assert [o["text"] for o in opts] == ["3", "4"]
    assert [o["is_correct"] for o in opts] == [False, True]


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

@pytest.mark.asyncio
async def test_export_import_round_trip(client, constructor_token):
    headers, _ = constructor_token
    src = await _bank("src")
    await _make_item(src.id, "MULTIPLE_CHOICE", "Pick one", [
        {"id": "a", "text": "no", "is_correct": False},
        {"id": "b", "text": "yes", "is_correct": True},
    ])
    await _make_item(src.id, "ESSAY", "Discuss", [])

    export = await client.get(f"/api/qti/items/export?bank_id={src.id}", headers=headers)
    assert export.status_code == 200
    assert export.headers["content-type"] == "application/zip"
    zip_bytes = export.content

    dest = await _bank("dest")
    imp = await client.post(
        "/api/qti/import",
        headers=headers,
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


@pytest.mark.asyncio
async def test_import_dry_run_does_not_persist(client, constructor_token):
    headers, _ = constructor_token
    src = await _bank("dry")
    await _make_item(src.id, "MULTIPLE_CHOICE", "Q", [
        {"id": "a", "text": "x", "is_correct": True},
    ])
    zip_bytes = (await client.get(f"/api/qti/items/export?bank_id={src.id}", headers=headers)).content

    dest = await _bank("drydest")
    imp = await client.post(
        "/api/qti/import",
        headers=headers,
        files={"file": ("pkg.zip", zip_bytes, "application/zip")},
        data={"bank_id": str(dest.id), "commit": "false"},
    )
    assert imp.status_code == 200
    assert imp.json()["committed"] is False
    assert await prisma.learning_objects.count(where={"bank_id": dest.id}) == 0


@pytest.mark.asyncio
async def test_import_reports_unsupported_item(client, constructor_token):
    headers, _ = constructor_token
    xml = (
        b'<assessmentItem xmlns="http://www.imsglobal.org/xsd/imsqti_v2p1" '
        b'identifier="hot-1" title="Hot"><itemBody><hotspotInteraction '
        b'responseIdentifier="RESPONSE"/></itemBody></assessmentItem>'
    )
    imp = await client.post(
        "/api/qti/import",
        headers=headers,
        files={"file": ("item.xml", xml, "text/xml")},
        data={"commit": "false"},
    )
    assert imp.status_code == 200
    body = imp.json()
    assert body["error_items"] == 1
    assert "Unsupported interaction" in body["items"][0]["message"]


@pytest.mark.asyncio
async def test_qti_export_forbidden_for_student(client, student_token):
    headers, _ = student_token
    resp = await client.get(f"/api/qti/items/export?bank_id={uuid.uuid4()}", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_qti_import_forbidden_for_student(client, student_token):
    headers, _ = student_token
    resp = await client.post(
        "/api/qti/import",
        headers=headers,
        files={"file": ("x.xml", b"<assessmentItem/>", "text/xml")},
        data={"commit": "false"},
    )
    assert resp.status_code == 403

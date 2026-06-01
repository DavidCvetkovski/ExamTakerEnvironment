"""Export OpenVision items and tests as QTI 2.1 IMS content packages.

By default the latest version of each item is exported. Correct responses are
included only when the actor has authoring access; student responses are never
exported (directive §9.3).
"""

from fastapi import HTTPException, status

from app.core.prisma_db import prisma
from app.services import integration_audit_service
from app.services.items_service import extract_text_from_tiptap_json
from app.services.qti import mappers, package

_EXPORTABLE = {"MULTIPLE_CHOICE", "MULTIPLE_RESPONSE", "ESSAY"}


def _latest_version(versions: list):
    """Return the highest-numbered item version, or None."""
    return max(versions, key=lambda v: v.version_number) if versions else None


def _item_xml(learning_object, *, include_correct: bool) -> tuple[str, str] | None:
    """Render one learning object to ``(href, xml)``, or None if unsupported."""
    version = _latest_version(learning_object.item_versions or [])
    if version is None or version.question_type not in _EXPORTABLE:
        return None
    href = f"items/item-{learning_object.id}.xml"
    title = (extract_text_from_tiptap_json(version.content or {})[:120]) or "Item"
    xml = mappers.item_to_xml(
        identifier=f"item-{learning_object.id}",
        title=title,
        question_type=version.question_type,
        content=version.content or {},
        options=version.options or {},
        include_correct=include_correct,
    )
    return href, xml


async def export_bank(bank_id: str, *, include_correct: bool, actor_id: str) -> bytes:
    """Export every supported item in a bank as a QTI package ZIP."""
    bank = await prisma.item_banks.find_unique(where={"id": bank_id})
    if bank is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item bank not found")
    objects = await prisma.learning_objects.find_many(
        where={"bank_id": bank_id}, include={"item_versions": True}
    )
    items = [x for x in (_item_xml(o, include_correct=include_correct) for o in objects) if x]
    if not items:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No exportable items in bank"
        )
    await integration_audit_service.record_integration_audit(
        integration="qti", action="export_bank", status="success", actor_user_id=actor_id,
        resource_type="item_bank", resource_id=bank_id,
        metadata={"item_count": len(items), "include_correct": include_correct},
    )
    return package.build_package(items)


async def export_learning_objects(
    lo_ids: list[str], *, include_correct: bool, actor_id: str
) -> bytes:
    """Export an explicit set of learning objects as a QTI package ZIP.

    Backs the "pick questions" export flow (the same picker used in blueprints).
    Unsupported/unknown ids are skipped; 404 only if nothing exportable remains.
    """
    if not lo_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No questions selected."
        )
    objects = await prisma.learning_objects.find_many(
        where={"id": {"in": lo_ids}}, include={"item_versions": True}
    )
    items = [x for x in (_item_xml(o, include_correct=include_correct) for o in objects) if x]
    if not items:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="None of the selected questions are exportable.",
        )
    await integration_audit_service.record_integration_audit(
        integration="qti",
        action="export_questions",
        status="success",
        actor_user_id=actor_id,
        resource_type="learning_objects",
        resource_id=None,
        metadata={
            "requested": len(lo_ids),
            "item_count": len(items),
            "include_correct": include_correct,
        },
    )
    return package.build_package(items)


async def export_test(test_definition_id: str, *, include_correct: bool, actor_id: str) -> bytes:
    """Export the items referenced by a test definition as a QTI package ZIP.

    Test blocks reference learning objects by id; each referenced item's latest
    version is exported. Unsupported items are skipped (reported via audit count).
    """
    test = await prisma.test_definitions.find_unique(where={"id": test_definition_id})
    if test is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    lo_ids = _learning_object_ids(test.blocks or [])
    objects = await prisma.learning_objects.find_many(
        where={"id": {"in": lo_ids}}, include={"item_versions": True}
    ) if lo_ids else []
    items = [x for x in (_item_xml(o, include_correct=include_correct) for o in objects) if x]
    if not items:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No exportable items in test"
        )
    await integration_audit_service.record_integration_audit(
        integration="qti", action="export_test", status="success", actor_user_id=actor_id,
        resource_type="test_definition", resource_id=test_definition_id,
        metadata={"item_count": len(items), "include_correct": include_correct},
    )
    return package.build_package(items)


_LO_ID_KEYS = ("learning_object_id", "lo_id", "question_id")


def _learning_object_ids(blocks) -> list[str]:
    """Collect learning-object ids from a test definition's block JSON.

    Blueprints nest fixed references under ``block["rules"][].learning_object_id``
    (Epoch 8.x shape), but older/simpler tests may put an id directly on the
    block. Walk the structure defensively and de-duplicate while preserving
    order so an item referenced twice is still exported once.
    """
    ids: list[str] = []

    def _take(obj) -> None:
        if not isinstance(obj, dict):
            return
        for key in _LO_ID_KEYS:
            value = obj.get(key)
            if value:
                ids.append(str(value))

    for block in blocks if isinstance(blocks, list) else []:
        if not isinstance(block, dict):
            continue
        _take(block)
        for rule in block.get("rules", []) or []:
            _take(rule)

    seen: set[str] = set()
    return [i for i in ids if not (i in seen or seen.add(i))]

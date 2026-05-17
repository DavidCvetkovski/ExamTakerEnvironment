import uuid
from typing import Optional

from app.core.prisma_db import prisma
from prisma import Json

from .schemas import ParsedBlueprint, ParsedQuestion, ParsedQuestionType, PersistResult

# Maps import format types to Prisma questiontype enum values
_TYPE_MAP = {
    ParsedQuestionType.MCQ: "MULTIPLE_CHOICE",
    ParsedQuestionType.MCQ_MULTI: "MULTIPLE_RESPONSE",
    ParsedQuestionType.ESSAY: "ESSAY",
}


def _build_tiptap_content(text: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": text}],
            }
        ],
    }


def _build_options(q: ParsedQuestion) -> dict:
    if q.question_type == ParsedQuestionType.ESSAY:
        return {
            "question_type": "ESSAY",
            "min_words": 0,
            "max_words": 0,
        }

    choices = [
        {
            "id": str(uuid.uuid4()),
            "text": opt.text,
            "is_correct": opt.is_correct,
            "weight": 1.0,
        }
        for opt in q.options
    ]
    return {
        "question_type": _TYPE_MAP[q.question_type],
        "choices": choices,
    }


def _build_metadata(q: ParsedQuestion) -> dict:
    meta: dict = {
        "bloom_level": q.bloom_level.value,
        "difficulty": q.difficulty.value,
        "points": q.points,
    }
    if q.tags:
        meta["topic"] = q.tags[0]
        meta["tags"] = q.tags
    if q.model_answer:
        meta["model_answer"] = q.model_answer
    return meta


async def persist_import(
    parsed: ParsedBlueprint,
    bank_id: str,
    create_blueprint: bool,
    author_user_id: str,
) -> PersistResult:
    """Persist all questions into the given bank and optionally create a blueprint."""
    lo_ids: list[str] = []
    header = parsed.header
    course_id: Optional[str] = None
    if header and header.course:
        course = await prisma.courses.find_unique(where={"code": header.course.strip()})
        if course and course.is_active:
            course_id = course.id

    # Build a map of block_name → list[lo_id] for blueprint assembly
    block_lo_map: dict[str, list[str]] = {}

    for block in parsed.blocks:
        block_lo_ids: list[str] = []
        for q in block.questions:
            lo_id = str(uuid.uuid4())

            await prisma.learning_objects.create(
                data={
                    "id": lo_id,
                    "bank_id": bank_id,
                    "course_id": course_id,
                    "created_by": author_user_id,
                }
            )

            await prisma.item_versions.create(
                data={
                    "id": str(uuid.uuid4()),
                    "learning_object_id": lo_id,
                    "version_number": 1,
                    "status": "DRAFT",
                    "question_type": _TYPE_MAP[q.question_type],
                    "content": Json(_build_tiptap_content(q.stem)),
                    "options": Json(_build_options(q)),
                    "metadata_tags": Json(_build_metadata(q)),
                    "created_by": author_user_id,
                }
            )

            lo_ids.append(lo_id)
            block_lo_ids.append(lo_id)

        block_lo_map[block.name] = block_lo_ids

    blueprint_id: Optional[str] = None
    if create_blueprint and parsed.blocks:
        title = (header.title if header and header.title else "Imported Blueprint")
        description = (header.description if header and header.description else None)
        duration = (header.duration_minutes if header and header.duration_minutes and header.duration_minutes > 0 else 60)

        blocks_data = [
            {
                "title": block_name,
                "rules": [
                    {"rule_type": "FIXED", "learning_object_id": lo_id}
                    for lo_id in lo_ids_in_block
                ],
            }
            for block_name, lo_ids_in_block in block_lo_map.items()
        ]

        td = await prisma.test_definitions.create(
            data={
                "id": str(uuid.uuid4()),
                "title": title,
                "description": description,
                "created_by": author_user_id,
                "blocks": Json(blocks_data),
                "duration_minutes": duration,
                "shuffle_questions": False,
                "scoring_config": Json({}),
            }
        )
        blueprint_id = td.id

    return PersistResult(lo_ids=lo_ids, blueprint_id=blueprint_id)

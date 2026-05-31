"""Instructor/admin management of LTI context and resource-link mappings.

These bindings are what make a learner launch resolvable: a Canvas context must
point at an OpenVision course, and a Canvas resource link must point at a
scheduled session. Launch-time resolution records the *unmapped* rows
(see ``mapping_service``); this module lets a human complete the binding.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status

from app.core.prisma_db import prisma
from app.schemas.lti import (
    LtiContextLinkPage,
    LtiContextLinkResponse,
    LtiResourceLinkPage,
    LtiResourceLinkResponse,
)
from app.services.integration_audit_service import record_integration_audit


async def list_context_links(
    *, skip: int, limit: int, unmapped_only: bool = False
) -> LtiContextLinkPage:
    """Return a paginated list of Canvas context links."""
    where = {"course_id": None} if unmapped_only else {}
    total = await prisma.lti_context_links.count(where=where)
    rows = await prisma.lti_context_links.find_many(
        where=where, order={"created_at": "desc"}, skip=skip, take=limit
    )
    return LtiContextLinkPage(
        items=[LtiContextLinkResponse.model_validate(r) for r in rows],
        total=total, skip=skip, limit=limit,
    )


async def map_context_to_course(
    context_link_id: str, course_id: str, actor_user_id: str
) -> LtiContextLinkResponse:
    """Bind a Canvas context to an existing OpenVision course."""
    context_link = await prisma.lti_context_links.find_unique(where={"id": context_link_id})
    if not context_link:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Context link not found.")

    course = await prisma.courses.find_unique(where={"id": course_id})
    if not course:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found.")

    updated = await prisma.lti_context_links.update(
        where={"id": context_link_id},
        data={"course_id": course_id, "updated_at": datetime.now(timezone.utc)},
    )
    await record_integration_audit(
        integration="lti", action="context.map", status="success",
        actor_user_id=actor_user_id, resource_type="lti_context_link",
        resource_id=context_link_id, metadata={"course_id": course_id},
    )
    return LtiContextLinkResponse.model_validate(updated)


async def list_resource_links(
    *, skip: int, limit: int, unmapped_only: bool = False
) -> LtiResourceLinkPage:
    """Return a paginated list of Canvas resource links."""
    where = {"scheduled_session_id": None} if unmapped_only else {}
    total = await prisma.lti_resource_links.count(where=where)
    rows = await prisma.lti_resource_links.find_many(
        where=where, order={"created_at": "desc"}, skip=skip, take=limit
    )
    return LtiResourceLinkPage(
        items=[LtiResourceLinkResponse.model_validate(r) for r in rows],
        total=total, skip=skip, limit=limit,
    )


async def map_resource_link(
    resource_link_id: str,
    *,
    scheduled_session_id: Optional[str],
    test_definition_id: Optional[str],
    actor_user_id: str,
) -> LtiResourceLinkResponse:
    """Bind a Canvas resource link to a scheduled session and/or test definition.

    Validates that referenced rows exist so a learner launch can't be pointed at
    a non-existent exam. At least one of the two targets must be supplied.
    """
    if scheduled_session_id is None and test_definition_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Provide a scheduled session and/or a test definition to map.",
        )

    resource_link = await prisma.lti_resource_links.find_unique(where={"id": resource_link_id})
    if not resource_link:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource link not found.")

    data = {"updated_at": datetime.now(timezone.utc)}
    if scheduled_session_id is not None:
        scheduled = await prisma.scheduled_exam_sessions.find_unique(
            where={"id": scheduled_session_id}
        )
        if not scheduled:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Scheduled session not found.")
        data["scheduled_session_id"] = scheduled_session_id
    if test_definition_id is not None:
        test_def = await prisma.test_definitions.find_unique(where={"id": test_definition_id})
        if not test_def:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Test definition not found.")
        data["test_definition_id"] = test_definition_id

    updated = await prisma.lti_resource_links.update(
        where={"id": resource_link_id}, data=data
    )
    await record_integration_audit(
        integration="lti", action="resource_link.map", status="success",
        actor_user_id=actor_user_id, resource_type="lti_resource_link",
        resource_id=resource_link_id,
        metadata={
            "scheduled_session_id": scheduled_session_id,
            "test_definition_id": test_definition_id,
        },
    )
    return LtiResourceLinkResponse.model_validate(updated)

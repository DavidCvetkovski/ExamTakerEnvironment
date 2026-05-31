"""Mapping of validated LTI launches onto OpenVision users, courses, and exams.

Everything here runs *after* the ``id_token`` has been cryptographically
verified (see ``launch_service.validate_launch``). The hard rule from the
directive (§7.7-7.10) is least privilege: a launch never escalates an account,
and an OpenVision admin is never minted from an LTI claim.
"""

import hashlib
import secrets
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from prisma import Json

from app.core.prisma_db import prisma
from app.core.security import hash_password
from app.models.user import UserRole
from app.services.lti.claims import LtiLaunchClaims

# LTI membership role suffixes (the part after the final '#' or '/').
_LEARNER_ROLES = {"Learner", "Student"}
_INSTRUCTOR_ROLES = {"Instructor", "TeachingAssistant", "ContentDeveloper", "Mentor"}
_ADMIN_ROLES = {"Administrator"}


def _role_suffixes(lti_roles: list[str]) -> set[str]:
    """Reduce full IMS role URIs to their trailing vocabulary term."""
    suffixes = set()
    for raw in lti_roles:
        term = raw.replace("#", "/").rstrip("/").rsplit("/", 1)[-1]
        if term:
            suffixes.add(term)
    return suffixes


def map_lti_role(lti_roles: list[str], existing_role: Optional[str] = None) -> UserRole:
    """Map LTI membership roles to an OpenVision role under least privilege.

    ``Administrator`` only yields ``ADMIN`` when the already-linked account is
    *already* an admin — an LTI launch can never elevate a fresh account.
    """
    suffixes = _role_suffixes(lti_roles)
    has_admin = bool(suffixes & _ADMIN_ROLES)
    has_instructor = bool(suffixes & _INSTRUCTOR_ROLES)
    has_learner = bool(suffixes & _LEARNER_ROLES)

    if has_admin and existing_role == UserRole.ADMIN.value:
        return UserRole.ADMIN
    if has_instructor or has_admin:
        return UserRole.CONSTRUCTOR
    if has_learner:
        return UserRole.STUDENT
    # Unknown/empty roles default to the least-privileged account.
    return UserRole.STUDENT


def is_instructor_launch(claims: LtiLaunchClaims) -> bool:
    """True when the launch carries instructor/admin authority (no learner-wins)."""
    suffixes = _role_suffixes(claims.roles)
    return bool(suffixes & (_INSTRUCTOR_ROLES | _ADMIN_ROLES)) and not (
        suffixes & _LEARNER_ROLES
    )


def _synthetic_email(issuer: str, subject: str) -> str:
    """Deterministic, non-deliverable placeholder email for provisioned users.

    Used when the launch carries no email, or an email already owned by another
    account — never reuse an existing email, which would be account takeover.
    """
    digest = hashlib.sha256(f"{issuer}|{subject}".encode("utf-8")).hexdigest()[:16]
    host = urlparse(issuer).netloc or "platform"
    return f"lti-{digest}.{host}@lti.invalid"


async def _provision_user(claims: LtiLaunchClaims, platform) -> object:
    """Create a fresh OpenVision account for a never-seen LTI subject."""
    role = map_lti_role(claims.roles, existing_role=None)
    name = claims.name or " ".join(
        p for p in (claims.given_name, claims.family_name) if p
    ) or None

    email = claims.email
    if not email or await prisma.users.find_unique(where={"email": email}):
        # No safe email to claim — synthesize a unique, non-deliverable one.
        email = _synthetic_email(claims.issuer, claims.subject)

    return await prisma.users.create(
        data={
            "email": email,
            "hashed_password": hash_password(secrets.token_urlsafe(32)),
            "role": role.value,
            "is_active": True,
        }
    )


async def resolve_lti_user(claims: LtiLaunchClaims, platform) -> object:
    """Return the OpenVision user for this launch, provisioning if first seen.

    Existing links are never re-roled — that would let a platform escalate an
    account by changing a membership claim. We only refresh launch metadata.
    """
    link = await prisma.lti_user_links.find_unique(
        where={"issuer_subject": {"issuer": claims.issuer, "subject": claims.subject}}
    )
    if link:
        await prisma.lti_user_links.update(
            where={"id": link.id},
            data={
                "email": claims.email,
                "name": claims.name,
                "last_roles": Json(claims.roles),
                "last_launch_at": datetime.now(timezone.utc),
            },
        )
        return await prisma.users.find_unique(where={"id": link.user_id})

    user = await _provision_user(claims, platform)
    await prisma.lti_user_links.create(
        data={
            "platform_id": str(platform.id),
            "issuer": claims.issuer,
            "subject": claims.subject,
            "user_id": str(user.id),
            "email": claims.email,
            "name": claims.name,
            "last_roles": Json(claims.roles),
            "last_launch_at": datetime.now(timezone.utc),
        }
    )
    return user


async def resolve_deployment(platform, deployment_id: str) -> Optional[object]:
    """Return the active deployment row for a launch's deployment claim."""
    return await prisma.lti_deployments.find_first(
        where={
            "platform_id": str(platform.id),
            "deployment_id": deployment_id,
            "is_active": True,
        }
    )


async def resolve_lti_context(claims: LtiLaunchClaims, platform, deployment) -> Optional[object]:
    """Return (creating if needed) the context link for this launch.

    A newly seen context is recorded unmapped (``course_id`` null) so an admin
    can later bind it — we never silently create an OpenVision course here.
    Returns ``None`` when the launch carries no context claim at all.
    """
    if not claims.context_id:
        return None

    existing = await prisma.lti_context_links.find_first(
        where={
            "platform_id": str(platform.id),
            "deployment_id": str(deployment.id),
            "context_id": claims.context_id,
        }
    )
    if existing:
        return existing

    return await prisma.lti_context_links.create(
        data={
            "platform_id": str(platform.id),
            "deployment_id": str(deployment.id),
            "context_id": claims.context_id,
            "context_label": claims.context_label,
            "context_title": claims.context_title,
        }
    )


async def resolve_lti_resource_link(
    claims: LtiLaunchClaims, platform, deployment, context_link
) -> Optional[object]:
    """Return (creating if needed) the resource-link mapping for this launch.

    Unmapped resource links (no scheduled session) are recorded so instructors
    can bind them later. AGS line-item URLs are captured when present.
    """
    if not claims.resource_link_id:
        return None

    data_updates = {
        "resource_title": claims.resource_link_title,
        "line_item_url": claims.ags_line_item_url,
    }
    existing = await prisma.lti_resource_links.find_first(
        where={
            "platform_id": str(platform.id),
            "deployment_id": str(deployment.id),
            "resource_link_id": claims.resource_link_id,
        }
    )
    if existing:
        return await prisma.lti_resource_links.update(
            where={"id": existing.id},
            data={k: v for k, v in data_updates.items() if v is not None},
        )

    return await prisma.lti_resource_links.create(
        data={
            "platform_id": str(platform.id),
            "deployment_id": str(deployment.id),
            "context_link_id": str(context_link.id) if context_link else None,
            "resource_link_id": claims.resource_link_id,
            **data_updates,
        }
    )


async def ensure_enrollment(user_id: str, course_id: str) -> None:
    """Ensure an active course enrollment exists for a learner launch."""
    await prisma.course_enrollments.upsert(
        where={"course_id_student_id": {"course_id": course_id, "student_id": user_id}},
        data={
            "create": {"course_id": course_id, "student_id": user_id, "is_active": True},
            "update": {"is_active": True},
        },
    )

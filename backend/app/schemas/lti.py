"""Schemas for LTI 1.3 platform registration and tool key management."""

from datetime import datetime
from typing import Any, List, Optional
from uuid import UUID

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator


def _normalize_deployment_id(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("Deployment IDs cannot be empty.")
    return normalized


class LtiPlatformCreate(BaseModel):
    """Admin request to register an external LTI platform deployment."""

    name: str = Field(min_length=1, max_length=120)
    issuer: AnyHttpUrl
    client_id: str = Field(min_length=1, max_length=255)
    auth_login_url: AnyHttpUrl
    auth_token_url: AnyHttpUrl
    auth_jwks_url: AnyHttpUrl
    deployment_ids: List[str] = Field(min_length=1, max_length=50)
    canvas_base_url: Optional[AnyHttpUrl] = None

    @field_validator("deployment_ids")
    @classmethod
    def normalize_deployment_ids(cls, value: List[str]) -> List[str]:
        """Trim deployment IDs and reject duplicates after normalization."""
        normalized = [_normalize_deployment_id(item) for item in value]
        if len(set(normalized)) != len(normalized):
            raise ValueError("Deployment IDs must be unique.")
        return normalized


class LtiPlatformUpdate(BaseModel):
    """Partial admin update for an LTI platform."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    auth_login_url: Optional[AnyHttpUrl] = None
    auth_token_url: Optional[AnyHttpUrl] = None
    auth_jwks_url: Optional[AnyHttpUrl] = None
    canvas_base_url: Optional[AnyHttpUrl] = None
    is_active: Optional[bool] = None


class LtiDeploymentResponse(BaseModel):
    """Registered deployment ID for an LTI platform."""

    id: UUID
    platform_id: UUID
    deployment_id: str
    label: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LtiPlatformResponse(BaseModel):
    """Public admin view of an LTI platform registration."""

    id: UUID
    name: str
    issuer: str
    client_id: str
    auth_login_url: str
    auth_token_url: str
    auth_jwks_url: str
    deployment_ids: List[str]
    canvas_base_url: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    deployments: List[LtiDeploymentResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class LtiPlatformPage(BaseModel):
    """Paginated list of LTI platform registrations."""

    items: List[LtiPlatformResponse]
    total: int
    skip: int
    limit: int


class LtiToolKeyResponse(BaseModel):
    """Admin-safe view of an LTI tool signing key."""

    id: UUID
    kid: str
    algorithm: str
    is_active: bool
    created_at: datetime
    rotated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class LtiJwksResponse(BaseModel):
    """JWKS response consumed by external LTI platforms."""

    keys: List[dict[str, Any]]


# ---------------------------------------------------------------------------
# Context / resource-link mapping (instructor & admin)
# ---------------------------------------------------------------------------


class LtiContextLinkResponse(BaseModel):
    """A Canvas context (course) and its OpenVision course binding, if any."""

    id: UUID
    platform_id: UUID
    deployment_id: UUID
    context_id: str
    context_label: Optional[str] = None
    context_title: Optional[str] = None
    course_id: Optional[UUID] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class LtiContextLinkPage(BaseModel):
    """Paginated list of LTI context links."""

    items: List[LtiContextLinkResponse]
    total: int
    skip: int
    limit: int


class LtiContextMappingUpdate(BaseModel):
    """Bind (or rebind) a Canvas context to an OpenVision course."""

    course_id: UUID


class LtiResourceLinkResponse(BaseModel):
    """A Canvas resource link and its OpenVision exam binding, if any."""

    id: UUID
    platform_id: UUID
    deployment_id: UUID
    context_link_id: Optional[UUID] = None
    resource_link_id: str
    resource_title: Optional[str] = None
    test_definition_id: Optional[UUID] = None
    scheduled_session_id: Optional[UUID] = None
    line_item_url: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class LtiResourceLinkPage(BaseModel):
    """Paginated list of LTI resource links."""

    items: List[LtiResourceLinkResponse]
    total: int
    skip: int
    limit: int


class LtiResourceMappingUpdate(BaseModel):
    """Bind a Canvas resource link to a scheduled session (student launch target).

    ``test_definition_id`` is optional context for instructor preview/deep-link;
    ``scheduled_session_id`` is what a learner launch joins.
    """

    scheduled_session_id: Optional[UUID] = None
    test_definition_id: Optional[UUID] = None

"""LTI 1.3 platform registration and public tool metadata endpoints."""

from urllib.parse import urlencode
from uuid import UUID

from fastapi import APIRouter, Depends, Form, Query, Request, Response, status
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.dependencies import require_role
from app.core.security import create_refresh_token
from app.models.user import User, UserRole
from app.schemas.lti import (
    LtiContextLinkPage,
    LtiContextLinkResponse,
    LtiContextMappingUpdate,
    LtiJwksResponse,
    LtiPlatformCreate,
    LtiPlatformPage,
    LtiPlatformResponse,
    LtiPlatformUpdate,
    LtiResourceLinkPage,
    LtiResourceLinkResponse,
    LtiResourceMappingUpdate,
    LtiToolKeyResponse,
)
from app.services.lti import (
    integration_admin_service,
    jwks_service,
    launch_service,
    platform_service,
)
from app.services.users_service import build_token_payload, set_refresh_cookie

router = APIRouter(prefix="/lti", tags=["lti"])


@router.get("/jwks", response_model=LtiJwksResponse)
async def get_jwks(response: Response):
    """Return active public LTI tool keys for platform-side JWT verification."""
    response.headers["Cache-Control"] = "public, max-age=300"
    return await jwks_service.get_public_jwks()


@router.get("/platforms", response_model=LtiPlatformPage)
async def list_platforms(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: User = Depends(require_role(UserRole.ADMIN)),
):
    """Admin-only paginated list of trusted LTI platform registrations."""
    return await platform_service.list_platforms(skip=skip, limit=limit)


@router.post("/platforms", response_model=LtiPlatformResponse, status_code=status.HTTP_201_CREATED)
async def create_platform(
    payload: LtiPlatformCreate,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Register a trusted LTI platform and its deployment IDs."""
    return await platform_service.create_platform(payload, str(current_user.id))


@router.patch("/platforms/{platform_id}", response_model=LtiPlatformResponse)
async def update_platform(
    platform_id: UUID,
    payload: LtiPlatformUpdate,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Update non-identity configuration for a registered LTI platform."""
    return await platform_service.update_platform(str(platform_id), payload, str(current_user.id))


@router.post("/platforms/{platform_id}/deactivate", response_model=LtiPlatformResponse)
async def deactivate_platform(
    platform_id: UUID,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Deactivate a platform and all of its deployments."""
    return await platform_service.deactivate_platform(str(platform_id), str(current_user.id))


@router.get("/tool-keys", response_model=list[LtiToolKeyResponse])
async def list_tool_keys(
    _: User = Depends(require_role(UserRole.ADMIN)),
):
    """Return admin-safe LTI tool signing key metadata."""
    return await jwks_service.list_tool_keys()


@router.post("/tool-keys/rotate", response_model=LtiToolKeyResponse, status_code=status.HTTP_201_CREATED)
async def rotate_tool_key(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Create a new active LTI tool signing key."""
    return await jwks_service.rotate_tool_key(str(current_user.id))


# Instructors and admins manage the bindings that make a learner launch resolve.
_require_integration_manager = require_role(UserRole.ADMIN, UserRole.CONSTRUCTOR)


@router.get("/contexts", response_model=LtiContextLinkPage)
async def list_context_links(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    unmapped_only: bool = Query(False),
    _: User = Depends(_require_integration_manager),
):
    """List Canvas contexts and their OpenVision course bindings."""
    return await integration_admin_service.list_context_links(
        skip=skip, limit=limit, unmapped_only=unmapped_only
    )


@router.patch("/contexts/{context_link_id}", response_model=LtiContextLinkResponse)
async def map_context_to_course(
    context_link_id: UUID,
    payload: LtiContextMappingUpdate,
    current_user: User = Depends(_require_integration_manager),
):
    """Bind a Canvas context to an existing OpenVision course."""
    return await integration_admin_service.map_context_to_course(
        str(context_link_id), str(payload.course_id), str(current_user.id)
    )


@router.get("/resource-links", response_model=LtiResourceLinkPage)
async def list_resource_links(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    unmapped_only: bool = Query(False),
    _: User = Depends(_require_integration_manager),
):
    """List Canvas resource links and their OpenVision exam bindings."""
    return await integration_admin_service.list_resource_links(
        skip=skip, limit=limit, unmapped_only=unmapped_only
    )


@router.patch("/resource-links/{resource_link_id}", response_model=LtiResourceLinkResponse)
async def map_resource_link(
    resource_link_id: UUID,
    payload: LtiResourceMappingUpdate,
    current_user: User = Depends(_require_integration_manager),
):
    """Bind a Canvas resource link to a scheduled session and/or test definition."""
    return await integration_admin_service.map_resource_link(
        str(resource_link_id),
        scheduled_session_id=str(payload.scheduled_session_id) if payload.scheduled_session_id else None,
        test_definition_id=str(payload.test_definition_id) if payload.test_definition_id else None,
        actor_user_id=str(current_user.id),
    )


@router.get("/login")
async def lti_login_get(
    request: Request,
    iss: str = Query(...),
    login_hint: str = Query(...),
    target_link_uri: str = Query(...),
    client_id: str | None = Query(None),
    lti_message_hint: str | None = Query(None),
):
    """LTI 1.3 OIDC login initiation via GET."""
    redirect_uri = str(request.base_url).rstrip("/") + "/api/lti/launch"
    redirect_url = await launch_service.initiate_login(
        iss=iss,
        login_hint=login_hint,
        target_link_uri=target_link_uri,
        client_id=client_id,
        lti_message_hint=lti_message_hint,
        redirect_uri=redirect_uri,
    )
    return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)


@router.post("/launch")
async def lti_launch(
    request: Request,
    state: str = Form(...),
    id_token: str = Form(...),
):
    """Validate an LTI 1.3 launch and hand off to the SPA launch resolver.

    On success a refresh cookie is set for the resolved OpenVision user and the
    browser is redirected to the frontend resolver with the target route.
    """
    outcome = await launch_service.validate_launch(
        state, id_token, request_id=request.headers.get("x-request-id")
    )
    target = (
        f"{settings.FRONTEND_BASE_URL.rstrip('/')}/lti/launch"
        f"?{urlencode({'next': outcome.redirect_path})}"
    )
    redirect = RedirectResponse(url=target, status_code=status.HTTP_302_FOUND)
    set_refresh_cookie(redirect, create_refresh_token(build_token_payload(outcome.user)))
    return redirect


@router.post("/login")
async def lti_login_post(
    request: Request,
    iss: str = Form(...),
    login_hint: str = Form(...),
    target_link_uri: str = Form(...),
    client_id: str | None = Form(None),
    lti_message_hint: str | None = Form(None),
):
    """LTI 1.3 OIDC login initiation via POST."""
    redirect_uri = str(request.base_url).rstrip("/") + "/api/lti/launch"
    redirect_url = await launch_service.initiate_login(
        iss=iss,
        login_hint=login_hint,
        target_link_uri=target_link_uri,
        client_id=client_id,
        lti_message_hint=lti_message_hint,
        redirect_uri=redirect_uri,
    )
    return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)


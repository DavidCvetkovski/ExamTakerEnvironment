"""LTI 1.3 platform registration and public tool metadata endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, Form, Query, Request, Response, status
from fastapi.responses import RedirectResponse

from app.core.dependencies import require_role
from app.models.user import User, UserRole
from app.schemas.lti import (
    LtiJwksResponse,
    LtiPlatformCreate,
    LtiPlatformPage,
    LtiPlatformResponse,
    LtiPlatformUpdate,
    LtiToolKeyResponse,
)
from app.services.lti import jwks_service, launch_service, platform_service

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


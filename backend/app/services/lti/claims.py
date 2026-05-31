"""Typed extraction of LTI 1.3 claims from JWT payloads."""

from dataclasses import dataclass
from typing import Any, List, Optional


@dataclass(frozen=True)
class LtiLaunchClaims:
    """Dataclass encapsulating standard and LTI-specific claims."""

    issuer: str
    subject: str
    audience: List[str]
    deployment_id: str
    message_type: str
    version: str
    roles: List[str]
    context_id: Optional[str]
    context_label: Optional[str]
    context_title: Optional[str]
    resource_link_id: Optional[str]
    resource_link_title: Optional[str]
    given_name: Optional[str]
    family_name: Optional[str]
    name: Optional[str]
    email: Optional[str]
    target_link_uri: Optional[str]
    deep_link_return_url: Optional[str]
    ags_line_items_url: Optional[str]
    ags_line_item_url: Optional[str]
    ags_scope: List[str]


def parse_claims(payload: dict[str, Any]) -> LtiLaunchClaims:
    """Extract and validate claims from an decoded LTI 1.3 JWT payload."""
    issuer = payload.get("iss", "")
    subject = payload.get("sub", "")

    aud = payload.get("aud", [])
    if isinstance(aud, str):
        audience = [aud]
    else:
        audience = list(aud)

    deployment_id = payload.get("https://purl.imsglobal.org/spec/lti/claim/deployment_id", "")
    message_type = payload.get("https://purl.imsglobal.org/spec/lti/claim/message_type", "")
    version = payload.get("https://purl.imsglobal.org/spec/lti/claim/version", "")
    roles = payload.get("https://purl.imsglobal.org/spec/lti/claim/roles", [])

    # Context mapping
    context = payload.get("https://purl.imsglobal.org/spec/lti/claim/context", {})
    context_id = context.get("id")
    context_label = context.get("label")
    context_title = context.get("title")

    # Resource link mapping
    resource_link = payload.get("https://purl.imsglobal.org/spec/lti/claim/resource_link", {})
    resource_link_id = resource_link.get("id")
    resource_link_title = resource_link.get("title")

    # Standard OIDC user information
    given_name = payload.get("given_name")
    family_name = payload.get("family_name")
    name = payload.get("name")
    email = payload.get("email")

    target_link_uri = payload.get("https://purl.imsglobal.org/spec/lti/claim/target_link_uri")

    # Deep linking configuration
    dl_settings = payload.get("https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings", {})
    deep_link_return_url = dl_settings.get("deep_link_return_url")

    # Assignment & Grade Services (AGS) endpoint
    ags_endpoint = payload.get("https://purl.imsglobal.org/spec/lti-ags/claim/endpoint", {})
    ags_line_items_url = ags_endpoint.get("lineitems")
    ags_line_item_url = ags_endpoint.get("lineitem")
    ags_scope = ags_endpoint.get("scope", [])

    return LtiLaunchClaims(
        issuer=issuer,
        subject=subject,
        audience=audience,
        deployment_id=deployment_id,
        message_type=message_type,
        version=version,
        roles=roles,
        context_id=context_id,
        context_label=context_label,
        context_title=context_title,
        resource_link_id=resource_link_id,
        resource_link_title=resource_link_title,
        given_name=given_name,
        family_name=family_name,
        name=name,
        email=email,
        target_link_uri=target_link_uri,
        deep_link_return_url=deep_link_return_url,
        ags_line_items_url=ags_line_items_url,
        ags_line_item_url=ags_line_item_url,
        ags_scope=ags_scope,
    )

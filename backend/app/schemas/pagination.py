"""Shared pagination envelope (Epoch 15, #25).

A single ``{items, total, skip, limit}`` page shape — the same convention the
LTI endpoints already use (``LtiPlatformPage`` et al.), promoted here to a
reusable generic so every list route can satisfy CLAUDE.md §4 ("Every list
endpoint must support pagination. Never return unbounded result sets.").

Use ``Page[T]`` as a route's ``response_model`` and wrap the (already-sorted)
service list with :func:`app.services.pagination.paginate`.
"""
from typing import Generic, List, TypeVar

from pydantic import BaseModel

T = TypeVar("T")

#: Default page size when the caller omits ``limit``.
DEFAULT_PAGE_LIMIT = 50
#: Hard cap on page size — bounds the response regardless of caller input.
MAX_PAGE_LIMIT = 200


class Page(BaseModel, Generic[T]):
    """Paginated slice of a list: ``items`` plus the total count for the query.

    ``skip``/``limit`` echo the request so the client can drive a "load more"
    cursor without tracking its own offset.
    """

    items: List[T]
    total: int
    skip: int
    limit: int

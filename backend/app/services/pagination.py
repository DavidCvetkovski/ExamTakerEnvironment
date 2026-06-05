"""Pure pagination helper (Epoch 15, #25).

Slices an already-ordered list into a :class:`app.schemas.pagination.Page`
payload. Pagination never reorders — the caller is responsible for producing
the list in its final sort order, then this trims it to the requested window.

This bounds the *response* (§4). It does not push ``skip``/``limit`` into the
database — several callers sort in Python after enrichment (e.g. the grading
overview's per-row ungraded counts, the item bank's subject-order sort), so
DB-level pagination would page the wrong order. DB-level pushdown is a future
optimization for the routes whose sort is expressible in SQL.
"""
from typing import Any, Dict, Sequence


def paginate(rows: Sequence[Any], skip: int, limit: int) -> Dict[str, Any]:
    """Return the ``rows[skip : skip + limit]`` window plus the full ``total``.

    Shaped for the ``Page[T]`` response_model; FastAPI validates the sliced
    items against the route's declared element type.
    """
    return {
        "items": list(rows[skip : skip + limit]),
        "total": len(rows),
        "skip": skip,
        "limit": limit,
    }

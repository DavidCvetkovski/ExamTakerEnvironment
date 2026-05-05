"""Pure formatting helpers for analytics output — no ReportLab dependency."""
from typing import Optional

__all__ = ["fmt"]


def fmt(val: Optional[float], digits: int = 2) -> str:
    """Format a nullable float, returning '—' when None."""
    if val is None:
        return "—"
    return f"{val:.{digits}f}"

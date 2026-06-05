"""
Core date and time zone normalization utilities.
"""
from datetime import datetime, timezone


def ensure_utc(value: datetime) -> datetime:
    """Normalize datetimes so status comparisons stay timezone-safe."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)

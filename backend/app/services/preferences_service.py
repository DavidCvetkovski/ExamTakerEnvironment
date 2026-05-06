"""Persistence operations for user preferences."""

from app.core.prisma_db import prisma


async def update_theme_preference(user_id: str, theme: str | None):
    """Persist a user's theme preference and return the updated user record."""
    return await prisma.users.update(
        where={"id": user_id},
        data={"theme_preference": theme},
    )

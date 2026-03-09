import pytest
from typing import AsyncGenerator
from prisma import Prisma
from app.main import app
from app.core.prisma_db import connect_prisma, disconnect_prisma, prisma as prisma_client
from httpx import AsyncClient, ASGITransport
import asyncio

@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"

@pytest.fixture(scope="session", autouse=True)
async def initialize_prisma():
    """Initializes Prisma connection for the entire test session."""
    await connect_prisma()
    yield
    await disconnect_prisma()

@pytest.fixture(scope="function")
async def cleanup_database():
    """Wipes all tables in the correct order to avoid FK violations."""
    # Order: Children first
    await prisma_client.interaction_events.delete_many()
    await prisma_client.exam_sessions.delete_many()
    await prisma_client.test_definitions.delete_many()
    await prisma_client.item_versions.delete_many()
    await prisma_client.learning_objects.delete_many()
    await prisma_client.media_assets.delete_many()
    await prisma_client.item_banks.delete_many()
    await prisma_client.users.delete_many()
    yield
    # No need to disconnect here as it's session scoped

@pytest.fixture(scope="function")
async def ac() -> AsyncGenerator[AsyncClient, None]:
    """Provides an asynchronous HTTP client for the entire session."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client

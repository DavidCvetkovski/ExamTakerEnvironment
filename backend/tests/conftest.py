import pytest
from typing import AsyncGenerator
from prisma import Prisma
from app.main import app
from app.core.prisma_db import connect_prisma, disconnect_prisma, prisma as prisma_client
from app.core import redis as redis_module
from app.core.redis import connect_redis, disconnect_redis
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

@pytest.fixture(scope="session", autouse=True)
async def initialize_redis():
    """Connect the Redis client for the test session.

    The ASGI test transport never runs the app's lifespan, so without this the
    heartbeat path (which enqueues to a Redis Stream) hits an uninitialized
    client. CI provides a Redis service; locally `docker compose` does.
    """
    await connect_redis()
    yield
    await disconnect_redis()


@pytest.fixture(scope="function")
async def cleanup_database():
    """Wipes all tables in the correct order to avoid FK violations.

    Also flushes Redis so each test starts with empty heartbeat streams (a
    prior test's queued events can't be drained into a now-deleted session)
    and reset rate-limit counters (repeated logins across tests never trip the
    limiter now that Redis is connected for the heartbeat pipeline).
    """
    if redis_module.redis_client is not None:
        await redis_module.redis_client.flushdb()
    # Order: Children first
    await prisma_client.self_heal_incidents.delete_many()
    await prisma_client.integration_audit_logs.delete_many()
    await prisma_client.lti_grade_passbacks.delete_many()
    await prisma_client.qti_jobs.delete_many()
    await prisma_client.sis_import_job_rows.delete_many()
    await prisma_client.sis_import_jobs.delete_many()
    await prisma_client.lti_resource_links.delete_many()
    await prisma_client.lti_context_links.delete_many()
    await prisma_client.lti_user_links.delete_many()
    await prisma_client.lti_launch_audits.delete_many()
    await prisma_client.lti_deployments.delete_many()
    await prisma_client.lti_platforms.delete_many()
    await prisma_client.lti_tool_keys.delete_many()
    await prisma_client.lti_deep_link_sessions.delete_many()
    await prisma_client.lti_oidc_states.delete_many()
    await prisma_client.accommodation_audit_log.delete_many()
    await prisma_client.interaction_events.delete_many()
    await prisma_client.question_grades.delete_many()
    await prisma_client.session_results.delete_many()
    # proctoring_incidents FK exam_sessions with onDelete: NoAction, so it must
    # be wiped before exam_sessions / scheduled_exam_sessions.
    await prisma_client.proctoring_incidents.delete_many()
    await prisma_client.exam_sessions.delete_many()
    await prisma_client.scheduled_exam_sessions.delete_many()
    await prisma_client.course_enrollments.delete_many()
    await prisma_client.test_definitions.delete_many()
    await prisma_client.item_versions.delete_many()
    await prisma_client.learning_objects.delete_many()
    # courses after learning_objects: the 8.7 WIP migration added
    # learning_objects.course_id with an FK to courses.id, so courses must
    # be deleted last among these three.
    await prisma_client.courses.delete_many()
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

from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.api.api import api_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.core.metrics import POSTGRES_READINESS_ERRORS_TOTAL, REDIS_ERRORS_TOTAL
from app.core.prisma_db import connect_prisma, disconnect_prisma, prisma
from app.core.redis import connect_redis, disconnect_redis, get_redis
from app.core.security import hash_password
from app.middleware import RequestContextMiddleware, SecurityHeadersMiddleware
from app.models import User, UserRole

# Initialise structured logging before anything else
configure_logging(
    level="DEBUG" if settings.ENVIRONMENT == "development" else "INFO",
    use_json=settings.ENVIRONMENT != "development",
)

# Optional Sentry integration
if settings.SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        release=settings.APP_VERSION,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        traces_sample_rate=0.1,
        # Never send PII fields
        send_default_pii=False,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: connect services, seed defaults, tear down."""
    # 0. Assert production config safety
    settings.assert_production_safe()

    # 1. Connect Prisma
    await connect_prisma()

    # 2. Connect Redis
    await connect_redis()

    # 3. Seed default accounts if absent
    defaults = [
        ("admin_e2e@vu.nl", UserRole.ADMIN, "adminpass123"),
        ("constructor_e2e@vu.nl", UserRole.CONSTRUCTOR, "conpass123"),
        ("student_e2e@vu.nl", UserRole.STUDENT, "studentpass123"),
    ]
    for email, role, password in defaults:
        user = await prisma.users.find_unique(where={"email": email})
        if not user:
            await prisma.users.create(
                data={
                    "id": str(UUID(int=hash(email) & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)),
                    "email": email,
                    "hashed_password": hash_password(password),
                    "role": role,
                    "is_active": True,
                    "provision_time_multiplier": 1.0,
                }
            )

    yield

    # 4. Disconnect Redis then Prisma
    await disconnect_redis()
    await disconnect_prisma()


app = FastAPI(
    title="OpenVision Ecosystem",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# --- Middleware (order matters: outermost = first to receive requests) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

# --- API routes ---
app.include_router(api_router, prefix="/api")


# --- Health endpoints ---
@app.get("/health", tags=["health"])
def health_check():
    """Liveness check — backward-compatibility alias."""
    return {"status": "ok", "service": "OpenVision Backend"}


@app.get("/health/live", tags=["health"])
def health_live():
    """Liveness check: process is running."""
    return {"status": "live", "version": settings.APP_VERSION}


@app.get("/health/ready", tags=["health"])
async def health_ready():
    """Readiness check: Postgres and Redis are reachable."""
    checks: dict = {}

    try:
        await prisma.query_raw("SELECT 1")
        checks["postgres"] = "ok"
    except Exception as exc:
        checks["postgres"] = f"down: {str(exc)}"
        POSTGRES_READINESS_ERRORS_TOTAL.inc()

    try:
        redis = get_redis()
        await redis.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"down: {str(exc)}"
        REDIS_ERRORS_TOTAL.labels(operation="ping").inc()

    is_ready = all(v == "ok" for v in checks.values())
    http_status = status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE
    # Must use JSONResponse to set the status code — returning a (body, status)
    # tuple would serialise as a JSON array with a 200, defeating the probe.
    return JSONResponse(
        status_code=http_status,
        content={
            "status": "ready" if is_ready else "unavailable",
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
            "checks": checks,
        },
    )


# --- Prometheus metrics ---
@app.get("/metrics", include_in_schema=False)
def metrics():
    """Prometheus scrape endpoint.

    In production this should only be reachable from the internal Nginx
    network, not exposed publicly.
    """
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

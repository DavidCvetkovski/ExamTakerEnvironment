# ─────────────────────────────────────────────────────────
# Backend multi-stage Dockerfile
#
# BUILD CONTEXT = REPO ROOT (not ./backend). Prisma is the single source of
# truth and its schema lives at the repo-root prisma/schema.prisma (CLAUDE.md),
# so the image must see both backend/ and prisma/. Build with:
#   docker build -f backend/Dockerfile -t openvision-backend .
# (docker-compose.prod.yml sets `context: .` + `dockerfile: backend/Dockerfile`.)
#
# Stage 1: builder — install deps AND generate the Prisma Python client. Node is
#          installed here because prisma-client-py shells out to the Prisma CLI
#          (via a global Node, PRISMA_USE_GLOBAL_NODE) to fetch the query engine.
#          The generated client lands in the venv's site-packages and the engine
#          binary is cached inside the venv (PRISMA_BINARY_CACHE_DIR) so both
#          travel to the runtime stage — which therefore needs NO Node.
# Stage 2: runtime — slim, non-root, runs the prebuilt query-engine binary.
# ─────────────────────────────────────────────────────────

# --- Stage 1: builder ---
FROM python:3.12-slim AS builder

WORKDIR /build

# build-essential/libpq-dev for C-extension wheels; nodejs+npm for Prisma codegen.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev nodejs npm && \
    rm -rf /var/lib/apt/lists/*

# Cache the Prisma engine binaries inside the venv so the runtime stage inherits
# them when it copies /venv (keeps the runtime image Node-free).
ENV PRISMA_BINARY_CACHE_DIR=/venv/prisma-binaries

COPY backend/requirements.txt .
RUN python -m venv /venv && \
    /venv/bin/pip install --upgrade pip && \
    /venv/bin/pip install --no-cache-dir -r requirements.txt
ENV PATH="/venv/bin:$PATH"

# Generate ONLY the Python client. The schema also declares a prisma-client-js
# generator whose output path (../frontend/node_modules/.prisma/client) is
# irrelevant and unavailable in this image, so we scope generation to py_client.
COPY prisma/ ./prisma/
RUN prisma generate --schema=prisma/schema.prisma --generator py_client

# --- Stage 2: runtime ---
FROM python:3.12-slim AS runtime

# libpq for psycopg + curl for the healthcheck. No Node — the query engine is a
# standalone binary baked into the venv during the builder stage.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 curl && \
    rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --shell /bin/bash --create-home appuser

WORKDIR /app

# Venv (includes the generated Prisma client + cached engine binaries)
COPY --from=builder --chown=appuser:appgroup /venv /venv
ENV PATH="/venv/bin:$PATH"
ENV PRISMA_BINARY_CACHE_DIR=/venv/prisma-binaries

# Application source (backend/ → /app)
COPY --chown=appuser:appgroup backend/ .

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -sf http://localhost:8000/health/live || exit 1

# Default command: API server
# Worker containers override this with:
#   command: python -m app.workers.heartbeat_worker
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

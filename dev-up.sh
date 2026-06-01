#!/usr/bin/env bash
#
# OpenVision development environment startup.
#
# Usage:
#   ./dev-up.sh            Start DB + backend + frontend (no data reset)
#   ./dev-up.sh --seed     Also reset/seed the database (preserves users)
#   ./dev-up.sh --no-front Start DB + backend only
#
# Flags accept short/long forms (-s / --seed) and may be combined.

set -euo pipefail

# Always operate from the repository root (this script's directory).
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Prefer agent-installed local toolchains if present.
[ -d "$ROOT_DIR/.node_local/bin" ] && export PATH="$ROOT_DIR/.node_local/bin:$PATH"
[ -d "$ROOT_DIR/.python_local/bin" ] && export PATH="$ROOT_DIR/.python_local/bin:$PATH"

# Pin Prisma to the version the schema + generated clients expect.
PRISMA="npx prisma@5.17.0"
SCHEMA="--schema=$ROOT_DIR/prisma/schema.prisma"

# --- Arguments -------------------------------------------------------------
SEED=false
RUN_FRONTEND=true
for arg in "$@"; do
    case "$arg" in
        -s|--seed|-seed|seed) SEED=true ;;
        --no-front|--backend-only) RUN_FRONTEND=false ;;
        -h|--help)
            sed -n '3,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *) echo "⚠️  Unknown argument: $arg (try --help)"; exit 2 ;;
    esac
done

# --- Prerequisites ---------------------------------------------------------
for cmd in docker python3 npm; do
    command -v "$cmd" >/dev/null 2>&1 || { echo "❌ $cmd is not installed."; exit 1; }
done

if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "📄 .env not found — creating from .env.example."
        cp .env.example .env
    else
        echo "❌ Missing .env and .env.example at repo root."; exit 1
    fi
fi

# Prisma + Python both read DATABASE_URL etc. from the environment.
set -a; source .env; set +a

# --- Cleanup trap ----------------------------------------------------------
PIDS=()
cleanup() {
    echo ""
    echo "🛑 Shutting down OpenVision..."
    for pid in "${PIDS[@]:-}"; do
        [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "🚀 Starting OpenVision development environment..."

# --- Free stale ports ------------------------------------------------------
echo "🧹 Cleaning up old dev servers..."
if command -v lsof >/dev/null 2>&1; then
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
else
    pkill -f "uvicorn app.main:app" 2>/dev/null || true
    pkill -f "next dev" 2>/dev/null || true
fi

# --- Database --------------------------------------------------------------
echo "📦 Starting database + Redis (Docker)..."
if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif docker-compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "❌ Docker Compose not found. Install Docker Desktop."; exit 1
fi
$DOCKER_COMPOSE up -d db redis

echo "⏳ Waiting for Postgres on localhost:5432..."
for _ in $(seq 1 60); do
    if (echo > /dev/tcp/localhost/5432) >/dev/null 2>&1; then
        echo "✅ Postgres is accepting connections."
        break
    fi
    sleep 0.5
done

# --- Backend setup ---------------------------------------------------------
echo "🐍 Setting up backend..."
cd backend
if [ ! -d .venv ]; then
    echo "   Creating virtualenv..."
    python3 -m venv .venv
fi
source .venv/bin/activate
python3 -m pip install --upgrade pip -q
pip install -q -r requirements.txt

echo "💎 Generating Prisma clients (JS + Python)..."
$PRISMA generate "$SCHEMA"

echo "⚙️  Applying database schema (prisma db push)..."
$PRISMA db push "$SCHEMA" --accept-data-loss
cd "$ROOT_DIR"

# --- Seed (optional) -------------------------------------------------------
if [ "$SEED" = true ]; then
    echo "🌱 Seeding / resetting database (preserving users)..."
    (cd backend && ./.venv/bin/python seed_e2e.py)
    echo "✅ Seeding complete."
else
    echo "🌱 Skipping seed (pass --seed to reset data)."
fi

# --- Frontend deps ---------------------------------------------------------
if [ "$RUN_FRONTEND" = true ] && [ ! -d frontend/node_modules ]; then
    echo "📦 Installing frontend dependencies..."
    (cd frontend && npm install)
fi

# --- Servers ---------------------------------------------------------------
echo "📡 Starting backend on http://127.0.0.1:8000 ..."
(cd backend && ./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload) &
PIDS+=("$!")

if [ "$RUN_FRONTEND" = true ]; then
    echo "🎨 Starting frontend on http://localhost:3000 ..."
    (cd frontend && npm run dev -- -p 3000) &
    PIDS+=("$!")
fi

echo ""
echo "✅ OpenVision is up. Press Ctrl+C to stop."
echo "   Backend:  http://127.0.0.1:8000   (docs at /docs)"
[ "$RUN_FRONTEND" = true ] && echo "   Frontend: http://localhost:3000"
echo ""
echo "   e2e logins (after --seed):"
echo "     admin_e2e@vu.nl / adminpass123"
echo "     constructor_e2e@vu.nl / conpass123"
echo "     student_e2e@vu.nl / studentpass123"
echo ""

# Block until interrupted; the trap tears both servers down.
# Plain `wait` for portability — macOS ships bash 3.2, which lacks `wait -n`.
wait

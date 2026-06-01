#!/usr/bin/env bash
#
# OpenVision development environment startup.
#
# Usage:
#   ./dev-up.sh            Start DB + backend + frontend (no data reset)
#   ./dev-up.sh --seed     Also reset/seed the database (preserves users)
#   ./dev-up.sh --no-front Start DB + backend only
#
# Flags may be combined and accept short/long forms (-s / --seed).

set -euo pipefail

# Always operate from the repository root (this script's directory), so the
# script works regardless of the caller's current directory.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# --- Arguments -------------------------------------------------------------
SEED=false
RUN_FRONTEND=true
for arg in "$@"; do
    case "$arg" in
        -s|--seed|-seed) SEED=true ;;
        --no-front|--backend-only) RUN_FRONTEND=false ;;
        -h|--help)
            sed -n '3,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *) echo "⚠️  Unknown argument: $arg (try --help)"; exit 2 ;;
    esac
done

# --- Cleanup trap ----------------------------------------------------------
# Track the servers we start so Ctrl+C tears both down cleanly instead of
# leaving orphaned uvicorn / next processes holding ports 8000 / 3000.
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

# --- Preconditions ---------------------------------------------------------
if [ ! -f .env ]; then
    echo "❌ Missing .env at repo root. Copy .env.example and fill it in."
    exit 1
fi
if [ ! -x backend/.venv/bin/python ]; then
    echo "❌ Backend virtualenv not found at backend/.venv."
    echo "   Create it with:  python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt"
    exit 1
fi

# --- Free stale ports ------------------------------------------------------
echo "🧹 Cleaning up old dev servers..."
pkill -f "uvicorn app.main:app" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true

# --- Database --------------------------------------------------------------
echo "📦 Starting database + Redis (Docker)..."
docker compose up -d db redis

echo "⏳ Waiting for Postgres on localhost:5432..."
for _ in $(seq 1 60); do
    if (echo > /dev/tcp/localhost/5432) >/dev/null 2>&1; then
        echo "✅ Postgres is accepting connections."
        break
    fi
    sleep 0.5
done

# --- Backend schema --------------------------------------------------------
echo "💎 Generating Prisma clients (JS + Python)..."
(cd backend && npx prisma generate)
(cd backend && .venv/bin/prisma py generate) || true

echo "⚙️  Applying database schema (prisma db push)..."
(cd backend && npx prisma db push)

# --- Seed (optional) -------------------------------------------------------
if [ "$SEED" = true ]; then
    echo "🌱 Seeding / resetting database (preserving users)..."
    (cd backend && PYTHONPATH=. .venv/bin/python seed_e2e.py)
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
echo "📡 Starting backend on http://localhost:8000 ..."
(cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000) &
PIDS+=("$!")

if [ "$RUN_FRONTEND" = true ]; then
    echo "🎨 Starting frontend on http://localhost:3000 ..."
    (cd frontend && npm run dev) &
    PIDS+=("$!")
fi

echo ""
echo "✅ OpenVision is up. Press Ctrl+C to stop."
echo ""

# Block until interrupted; the EXIT/INT/TERM trap tears both servers down.
# (Plain `wait` for portability — macOS ships bash 3.2, which lacks `wait -n`.)
wait

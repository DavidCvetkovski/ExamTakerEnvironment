#!/usr/bin/env bash
#
# OpenVision development environment startup.
#
# Usage:
#   ./dev-up.sh            Start DB + backend + frontend (no data reset)
#   ./dev-up.sh --seed     Also reset/seed the database (preserves users)
#   ./dev-up.sh --no-front Start DB + backend only
#   ./dev-up.sh --verbose  Stream all subprocess output (no quiet steps)
#
# Flags accept short/long forms (-s / --seed) and may be combined.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# ---------------------------------------------------------------------------
# Presentation: colours only when attached to a real terminal, so piped/CI
# output stays clean. Everything pretty lives in these helpers; the rest of
# the script just calls step / say / die.
# ---------------------------------------------------------------------------
if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
    BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
    GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'
    CYAN=$'\033[36m'; MAGENTA=$'\033[35m'; GREY=$'\033[90m'
else
    BOLD=""; DIM=""; RESET=""; GREEN=""; RED=""; YELLOW=""
    CYAN=""; MAGENTA=""; GREY=""
fi

CHECK="${GREEN}✔${RESET}"
CROSS="${RED}✗${RESET}"
ARROW="${CYAN}▸${RESET}"
VERBOSE=false

say()  { printf '%s\n' "$*"; }
note() { printf '   %s%s%s\n' "$GREY" "$*" "$RESET"; }

banner() {
    printf '\n'
    printf '   %s%s███████%s  %s%sOpenVision%s\n' "$BOLD" "$MAGENTA" "$RESET" "$BOLD" "$RESET" "$RESET"
    printf '   %s%s██   ██%s  %sdevelopment environment%s\n' "$BOLD" "$MAGENTA" "$RESET" "$DIM" "$RESET"
    printf '   %s%s███████%s\n' "$BOLD" "$MAGENTA" "$RESET"
}

section() {
    printf '\n %s%s%s\n' "$BOLD" "$1" "$RESET"
}

die() {
    printf '\n %s%sStartup failed.%s %s\n\n' "$RED" "$BOLD" "$RESET" "$1"
    exit 1
}

# step "Label" cmd args...
# Runs the command quietly. On success: a tidy green check line.
# On failure: a red cross, then the FULL raw captured output (the only time we
# allow things to look ugly), and aborts.
step() {
    local label="$1"; shift
    if [ "$VERBOSE" = true ]; then
        printf ' %s %s%s%s\n' "$ARROW" "$DIM" "$label" "$RESET"
        "$@"
        return $?
    fi
    printf ' %s %s … ' "$ARROW" "$label"
    local log; log="$(mktemp)"
    if "$@" >"$log" 2>&1; then
        printf '\r %s %s    \n' "$CHECK" "$label"
        rm -f "$log"
    else
        local rc=$?
        printf '\r %s %s\n' "$CROSS" "$label"
        printf '\n%s──────────── command output ────────────%s\n' "$GREY" "$RESET"
        cat "$log"
        printf '%s─────────────────────────────────────────%s\n' "$GREY" "$RESET"
        rm -f "$log"
        die "Step \"$label\" exited with code $rc."
    fi
}

# --- Arguments -------------------------------------------------------------
SEED=false
RUN_FRONTEND=true
for arg in "$@"; do
    case "$arg" in
        -s|--seed|-seed|seed) SEED=true ;;
        --no-front|--backend-only) RUN_FRONTEND=false ;;
        -v|--verbose) VERBOSE=true ;;
        -h|--help)
            sed -n '3,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *) printf ' %s Unknown argument: %s (try --help)\n' "$CROSS" "$arg"; exit 2 ;;
    esac
done

# Pin Prisma to the version the schema + generated clients expect.
PRISMA="npx prisma@5.17.0"
SCHEMA="--schema=$ROOT_DIR/prisma/schema.prisma"

banner

# --- Prerequisites ---------------------------------------------------------
section "Checking prerequisites"
for cmd in docker python3 npm; do
    if command -v "$cmd" >/dev/null 2>&1; then
        printf ' %s %s\n' "$CHECK" "$cmd"
    else
        printf ' %s %s\n' "$CROSS" "$cmd"
        die "$cmd is not installed."
    fi
done

if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        step "Creating .env from .env.example" cp .env.example .env
    else
        die "Missing .env and .env.example at repo root."
    fi
fi
# Prisma + Python both read DATABASE_URL etc. from the environment.
set -a; source .env; set +a

# Prefer agent-installed local toolchains if present.
[ -d "$ROOT_DIR/.node_local/bin" ] && export PATH="$ROOT_DIR/.node_local/bin:$PATH"
[ -d "$ROOT_DIR/.python_local/bin" ] && export PATH="$ROOT_DIR/.python_local/bin:$PATH"

# --- Cleanup trap ----------------------------------------------------------
PIDS=()
cleanup() {
    printf '\n %s%sShutting down OpenVision…%s\n' "$YELLOW" "$BOLD" "$RESET"
    for pid in "${PIDS[@]:-}"; do
        [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# --- Free stale ports ------------------------------------------------------
section "Freeing ports"
free_ports() {
    if command -v lsof >/dev/null 2>&1; then
        lsof -ti:8000 | xargs kill -9 2>/dev/null || true
        lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    else
        pkill -f "uvicorn app.main:app" 2>/dev/null || true
        pkill -f "next dev" 2>/dev/null || true
    fi
}
step "Releasing :8000 and :3000" free_ports

# --- Database --------------------------------------------------------------
section "Database"
if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif docker-compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    die "Docker Compose not found. Install Docker Desktop."
fi
step "Starting Postgres + Redis (Docker)" $DOCKER_COMPOSE up -d db redis

wait_for_postgres() {
    for _ in $(seq 1 60); do
        (echo > /dev/tcp/localhost/5432) >/dev/null 2>&1 && return 0
        sleep 0.5
    done
    return 1
}
step "Waiting for Postgres on :5432" wait_for_postgres

# --- Backend setup ---------------------------------------------------------
section "Backend"
if [ ! -d backend/.venv ]; then
    step "Creating Python virtualenv" python3 -m venv backend/.venv
fi
# The Prisma Python generator (prisma-client-py) is installed into the venv, so
# every Prisma call must run with the venv activated or `prisma generate` fails
# with "prisma-client-py: command not found".
step "Installing backend dependencies" \
    bash -c "cd backend && source .venv/bin/activate && python3 -m pip install --upgrade pip -q && pip install -q -r requirements.txt"
step "Generating Prisma clients (JS + Python)" \
    bash -c "cd backend && source .venv/bin/activate && $PRISMA generate $SCHEMA"
step "Applying database schema (prisma db push)" \
    bash -c "cd backend && source .venv/bin/activate && $PRISMA db push $SCHEMA --accept-data-loss"

# --- Seed (optional) -------------------------------------------------------
if [ "$SEED" = true ]; then
    section "Seeding"
    step "Resetting + seeding database (users preserved)" \
        bash -c "cd backend && ./.venv/bin/python seed_e2e.py"
fi

# --- Frontend deps ---------------------------------------------------------
if [ "$RUN_FRONTEND" = true ] && [ ! -d frontend/node_modules ]; then
    section "Frontend"
    step "Installing frontend dependencies" \
        bash -c "cd frontend && npm install"
fi

# --- Servers ---------------------------------------------------------------
section "Starting servers"

# Server logs go to files so the terminal stays clean; we surface a tidy
# "ready" line once each health check passes, and dump the log if one dies.
( cd backend && ./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload \
    > "$ROOT_DIR/backend/backend.log" 2>&1 ) &
PIDS+=("$!")

wait_for_http() {  # url, max_tries
    for _ in $(seq 1 "$2"); do
        curl -sf "$1" >/dev/null 2>&1 && return 0
        sleep 1
    done
    return 1
}

if wait_for_http "http://127.0.0.1:8000/health" 30; then
    printf ' %s Backend  %shttp://127.0.0.1:8000%s  %s(docs: /docs)%s\n' \
        "$CHECK" "$CYAN" "$RESET" "$GREY" "$RESET"
else
    printf ' %s Backend failed to start\n' "$CROSS"
    printf '\n%s──────────── backend.log (tail) ────────────%s\n' "$GREY" "$RESET"
    tail -n 40 "$ROOT_DIR/backend/backend.log" 2>/dev/null || true
    printf '%s─────────────────────────────────────────────%s\n' "$GREY" "$RESET"
    die "See backend/backend.log for details."
fi

if [ "$RUN_FRONTEND" = true ]; then
    ( cd frontend && npm run dev -- -p 3000 \
        > "$ROOT_DIR/frontend/frontend.log" 2>&1 ) &
    PIDS+=("$!")
    if wait_for_http "http://127.0.0.1:3000" 40; then
        printf ' %s Frontend %shttp://localhost:3000%s\n' "$CHECK" "$CYAN" "$RESET"
    else
        printf ' %s Frontend failed to start\n' "$CROSS"
        printf '\n%s──────────── frontend.log (tail) ────────────%s\n' "$GREY" "$RESET"
        tail -n 40 "$ROOT_DIR/frontend/frontend.log" 2>/dev/null || true
        printf '%s──────────────────────────────────────────────%s\n' "$GREY" "$RESET"
        die "See frontend/frontend.log for details."
    fi
fi

# --- Ready banner ----------------------------------------------------------
printf '\n %s%s✓ OpenVision is up.%s  %sPress Ctrl+C to stop.%s\n' \
    "$BOLD" "$GREEN" "$RESET" "$DIM" "$RESET"
if [ "$SEED" = true ]; then
    printf '\n %se2e logins%s\n' "$BOLD" "$RESET"
    printf '   %s%-12s%s admin_e2e@vu.nl        / adminpass123\n'       "$DIM" "Admin"       "$RESET"
    printf '   %s%-12s%s constructor_e2e@vu.nl  / conpass123\n'         "$DIM" "Constructor" "$RESET"
    printf '   %s%-12s%s student_e2e@vu.nl      / studentpass123\n'     "$DIM" "Student"     "$RESET"
fi
printf '\n %slogs%s  backend/backend.log · frontend/frontend.log\n\n' "$DIM" "$RESET"

# Block until interrupted; the trap tears both servers down.
# Plain `wait` for portability — macOS ships bash 3.2, which lacks `wait -n`.
wait

#!/bin/bash

# OpenVision Local Development Launcher
# This script spins up the DB, Backend, and Frontend, then opens the site.

# Exit on error
set -e

echo "🚀 Starting OpenVision Development Environment..."

# 1. Start Docker Database
echo "📦 Starting Database (Docker)..."

# Detect docker-compose command (V2 vs V1)
if docker compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif docker-compose version > /dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "❌ Error: Docker Compose not found. Please install Docker Desktop."
    exit 1
fi

$DOCKER_COMPOSE up -d db

# 2. Setup Backend
echo "🐍 Setting up Backend..."
cd backend
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt

# Run migrations
echo "⚙️ Running Database Migrations..."
alembic upgrade head
cd ..

# 3. Setup Frontend
echo "⚛️ Setting up Frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install -q
fi
cd ..

# Parse flags
SEED_DB=false
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --seed) SEED_DB=true ;;
    esac
    shift
done

# 4. Start Servers
echo "📡 Starting Backend (Port 8000)..."
cd backend
source .venv/bin/activate
if [ "$SEED_DB" = true ]; then
    echo "🌱 Seeding Database..."
    export PYTHONPATH=$PYTHONPATH:.
    python3 seed_e2e.py
fi
uvicorn app.main:app --host 127.0.0.1 --port 8000 > /dev/null 2>&1 &
BACKEND_PID=$!
cd ..

echo "🎨 Starting Frontend (Port 3000)..."
cd frontend
npm run dev -- -p 3000 > /dev/null 2>&1 &
FRONTEND_PID=$!
cd ..

# Clean up function
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    echo "Done."
    exit
}

trap cleanup SIGINT SIGTERM

# 5. Wait for availability
echo "⏳ Waiting for servers to warm up..."
max_retries=30
count=0
while ! curl -s http://127.0.0.1:8000/health > /dev/null; do
    sleep 1
    count=$((count + 1))
    if [ $count -eq $max_retries ]; then
        echo "❌ Backend failed to start. Check logs."
        cleanup
    fi
done

while ! curl -s http://127.0.0.1:3000/login > /dev/null; do
    sleep 1
done

echo "✅ Environment is ready!"
echo "🌐 Opening http://127.0.0.1:3000 in your browser..."
open http://127.0.0.1:3000

echo "-------------------------------------------------------"
echo "Login Credentials (e2e):"
echo "  Admin:       admin_e2e@vu.nl / adminpass123"
echo "  Constructor: constructor_e2e@vu.nl / conpass123"
echo "  Student:     student_e2e@vu.nl / studentpass123"
echo ""
echo "Role Definitions:"
echo "  - ADMIN: Full system access, users & config management."
echo "  - CONSTRUCTOR: Authors questions and test blueprints."
echo "  - STUDENT: Takes exams and views results."
echo "-------------------------------------------------------"
echo "Press Ctrl+C to stop both servers."
echo "-------------------------------------------------------"

# Keep script running to maintain processes
wait

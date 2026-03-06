#!/bin/bash

# OpenVision Local Development Launcher
# This script spins up the DB, Backend, and Frontend, then opens the site.

# Exit on error
set -e

echo "🚀 Starting OpenVision Development Environment..."

# 1. Start Docker Database
echo "📦 Starting Database (Docker)..."
docker-compose up -d db

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

# 4. Start Servers
echo "📡 Starting Backend (Port 8000)..."
cd backend
source .venv/bin/activate
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

while ! curl -s http://localhost:3000/login > /dev/null; do
    sleep 1
done

echo "✅ Environment is ready!"
echo "🌐 Opening http://localhost:3000 in your browser..."
open http://localhost:3000

echo "-------------------------------------------------------"
echo "Press Ctrl+C to stop both servers."
echo "-------------------------------------------------------"

# Keep script running to maintain processes
wait

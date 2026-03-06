#!/bin/bash

# 1. Kill any existing processes on 3000 and 8000
echo "Cleaning up ports 3000 and 8000..."
lsof -ti :3000 | xargs kill -9 2>/dev/null
lsof -ti :8000 | xargs kill -9 2>/dev/null
sleep 2

# 2. Start Backend
echo "Starting Backend on 127.0.0.1:8000..."
cd ../backend
source .venv/bin/activate
export PYTHONPATH=.
uvicorn app.main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!
cd ../frontend

# 3. Start Frontend
echo "Starting Frontend on 127.0.0.1:3000..."
npm run dev -- -p 3000 &
FRONTEND_PID=$!

# 4. Wait for Backend
echo "Waiting for Backend (http://127.0.0.1:8000/health)..."
MAX_RETRIES=30
COUNT=0
until curl -s http://127.0.0.1:8000/health > /dev/null || [ $COUNT -eq $MAX_RETRIES ]; do
  sleep 1
  ((COUNT++))
done

if [ $COUNT -eq $MAX_RETRIES ]; then
  echo "Backend failed to start."
  kill -9 $BACKEND_PID $FRONTEND_PID 2>/dev/null
  exit 1
fi
echo "Backend is ready."

# 5. Wait for Frontend
echo "Waiting for Frontend (http://127.0.0.1:3000/login)..."
COUNT=0
until curl -s http://127.0.0.1:3000/login > /dev/null || [ $COUNT -eq $MAX_RETRIES ]; do
  sleep 1
  ((COUNT++))
done

if [ $COUNT -eq $MAX_RETRIES ]; then
  echo "Frontend failed to start."
  kill -9 $BACKEND_PID $FRONTEND_PID 2>/dev/null
  exit 1
fi
echo "Frontend is ready. Warming up..."
sleep 10 # Extra warm up for Next.js

# 6. Run Playwright Tests
echo "Running Playwright E2E tests..."
npx playwright test tests/e2e/exam-flow.spec.ts --project=chromium
TEST_EXIT_CODE=$?

# 7. Cleanup
echo "Cleaning up processes $BACKEND_PID and $FRONTEND_PID..."
kill -9 $BACKEND_PID 2>/dev/null
kill -9 $FRONTEND_PID 2>/dev/null
lsof -ti :3000 | xargs kill -9 2>/dev/null
lsof -ti :8000 | xargs kill -9 2>/dev/null

exit $TEST_EXIT_CODE

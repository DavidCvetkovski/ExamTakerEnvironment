# OpenVision Implementation Summary & Setup Guide

This document provides a comprehensive overview of the OpenVision project, its current implementation status, code structure, and detailed instructions on how to run the system.

## 1. Project Overview
OpenVision is a high-fidelity replica of the TestVision assessment ecosystem, designed for VU Amsterdam. It follows a robust 3-layer architecture (Directive, Orchestration, Execution) to ensure reliability, scalability, and maintainability.

## 2. Implementation Progress (Epoch-by-Epoch)

The project is structured into distinct "Epochs," each representing a major milestone.

### ✅ Epoch 1: Foundation & Infrastructure
- **Status:** Complete.
- **Implemented:** Monorepo structure, Docker Compose for PostgreSQL 15 and Redis 7, FastAPI backend scaffold with `/health`, and Next.js frontend with Tailwind CSS 4 and TypeScript.

### ✅ Epoch 2: The Constructor's Workbench
- **Status:** Complete.
- **Implemented:** Advanced item authoring with immutable versioning. Features include:
    - **Models:** `User`, `ItemBank`, `LearningObject`, `ItemVersion`, `MediaAsset`.
    - **UI:** TipTap WYSIWYG editor with code block support.
    - **Logic:** Debounced auto-save to Zustand and Backend. MCQ options panel with correct-answer toggling.

### ✅ Epoch 3: Authentication & RBAC
- **Status:** Complete.
- **Implemented:** Secure access control.
    - **Auth:** JWT-based authentication (Login/Register).
    - **RBAC:** Roles (Constructor, Reviewer, Admin, Student) enforced via middleware.
    - **Security:** Password hashing using `bcrypt`.

### ✅ Epoch 4: The Test Matrix & Blueprint Engine
- **Status:** Complete.
- **Implemented:** Logic for creating structured exams from item banks.
    - **TestDefinition:** Blueprints with "At Random" selection rules and block structures.
    - **ExamSession:** The "Freeze" mechanism—instantiating a session that preserves item versions even if the bank changes.
    - **Accommodations:** Student-specific time multipliers (e.g., +30% time).

### 🟡 Epoch 5: Student Frontier (Exam-Taking)
- **Status:** In Progress (Skeleton).
- **Implemented:** Basic routing and static question rendering.
- **Missing:** Timeline Navigator, Heartbeat/Direct Storage, Interaction Logging, and Submission logic.

---

## 3. Code Structure

### 📂 `backend/` (FastAPI / Python)
- `app/api/endpoints/`: REST API routes (auth, items, sessions, tests).
- `app/models/`: SQLAlchemy database models.
- `app/schemas/`: Pydantic models for data validation (DTOs).
- `app/core/`: Security (JWT), Database config, and dependencies.
- `alembic/`: Database migration scripts for schema versioning.
- `tests/`: Pytest suite (Unit, Integration, RBAC).

### 📂 `frontend/` (Next.js / TypeScript)
- `src/app/`: App Router pages (login, author, blueprint, exam, items).
- `src/components/`: Reusable UI components (Editor, ProtectedRoute).
- `src/stores/`: Zustand state management (Auth, Authoring, Exam, Library).
- `src/lib/`: API client configuration.
- `tests/e2e/`: Playwright end-to-end testing.

### 📂 `directives/` (Markdown)
- Engineering blueprints and roadmaps for each Epoch. These serve as the "Layer 1" (Intent) of the system.

---

## 4. How to Run the Program

### Prerequisites
- **Docker & Docker Compose**
- **Python 3.12+**
- **Node.js 20+**

### Step 1: Start Infrastructure (Database & Cache)
Open a terminal in the project root and run:
```bash
docker-compose up -d
```
*This starts PostgreSQL on port 5432 and Redis on port 6379.*

### Step 2: Setup and Start the Backend
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run migrations (to create the DB tables):
   ```bash
   alembic upgrade head
   ```
5. Start the server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

### Step 3: Setup and Start the Frontend
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Access the application at `http://localhost:3000`.

---

## 5. Verification
To ensure everything is working correctly, you can run the connection test script:
```bash
cd backend
python test_connections.py
```
Expected output:
```text
✅ Postgres connection successful!
✅ Redis connection successful!
```

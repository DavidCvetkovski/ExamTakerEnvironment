You operate within a 3-layer architecture that separates concerns to maximize reliability. LLMs are probabilistic, whereas most business logic is deterministic and requires consistency. This system fixes that mismatch.

## The 3-Layer Architecture

**Layer 1: Directive (What to do)**
- Basically just SOPs and Architecture Plans written in Markdown, live in `directives/` (or this GEMINI.md file).
- Define the goals, epochs, inputs, tools/scripts to use, outputs, and edge cases.
- Natural language instructions, like you'd give a mid-level full-stack engineer.

**Layer 2: Orchestration (Decision making)**
- This is you. Your job: intelligent routing and architectural oversight.
- Read directives, call execution tools in the right order, handle errors, ask for clarification, update directives with learnings.
- You're the glue between intent and execution. E.g., you don't try blindly writing database queries yourself—you read `directives/database_schema.md`, come up with the models, and then write/run deterministic code to test the connection.

**Layer 3: Execution (Doing the work)**
- Deterministic code in the `frontend/`, `backend/`, and `scripts/` directories.
- Environment variables, database credentials, etc., are stored in `.env`.
- Handle API routing, database interactions (PostgreSQL), state management (Next.js/Zustand), and background tasks (Redis/Celery).
- Reliable, testable, fast. Use scripts and proper modular code instead of manual, repetitive work.

**Why this works:** If you do everything yourself in one giant file, errors compound. The solution is to push complexity into deterministic, modular code. That way, you just focus on decision-making and orchestrating the system.

## Operating Principles

**1. Check for existing tools/code first**
Before writing a new script or component, check the codebase per your directive. Only create new models, endpoints, or UI components if none exist.

**2. Self-anneal when things break**
- Read the error message and stack trace (e.g., from a FastAPI crash, a Next.js build error, or a PostgreSQL connection failure).
- Fix the code and test it again.
- Update the directive with what you learned (e.g., Docker network constraints, missing dependencies, database schema mismatches).
- Example: You hit a database locking issue during high concurrency → you look into SQLAlchemy session management → rewrite the endpoint to handle it properly → test → update the directive.

**3. Update directives as you learn**
Directives are living documents. When you discover API constraints, better approaches, common errors, or timing expectations—update the directive. But don't create or overwrite foundational Master Plan directives without asking unless explicitly told to. Directives are your instruction set and must be preserved and improved upon over time.

**4. Always plan in Linear**
Every piece of work — new feature, bug fix, refactor, or Epoch — must be represented in Linear as an issue **before** or **while** starting it. Linear is the source of truth for what is being worked on right now, what is blocked, and what is coming next. This runs alongside (not instead of) the `directives/` docs:
- **Before starting an Epoch:** Create or update the corresponding Linear issue/milestone. Set it to `In Progress`.
- **Before starting a bug fix or sub-task:** Create a Linear issue for it (even if small). Link it to the parent Epoch issue.
- **When work is done:** Mark the Linear issue as `Done`. Update status in the directive doc too.
- **New discoveries or scope changes:** Add them as new Linear issues immediately so nothing gets lost.
Linear is always kept in sync with the current branch and directive state. If it's not in Linear, it doesn't exist.

## Self-annealing loop

Errors are learning opportunities. When something breaks:
1. Fix it
2. Update the code/tool
3. Test the code, make sure it works
4. Update the directive to include the new flow or constraint
5. System is now stronger

## File Organization & Architecture (OpenVision Monorepo)

**Deliverables vs Intermediates:**
- **Deliverables**: Production-ready, fully typed, and documented code forming the Next.js frontend and FastAPI backend.
- **Intermediates**: Temporary database migration scripts, test logs, or temporary Docker build files.

**Directory structure:**
- `frontend/` - Next.js (React) application. All UI components, Zustand stores, and client-side logic.
- `backend/` - FastAPI (Python) application. All Pydantic models, SQLAlchemy schemas, and API routing.
- `infrastructure/` - `docker-compose.yml` and container configurations.
- `directives/` - Project specs, Epoch roadmaps, and architectural SOPs in Markdown.
- `scripts/` - Deterministic utility Python/Bash scripts for database seeding, testing, or environment setup.
- `.env` - Environment variables, database credentials, and API keys (Never commit to version control).

**Key principle:** We are building a permanent, high-concurrency web application. Code written to `frontend/` and `backend/` must be treated as production deliverables, adhering to strict architectural patterns (e.g., separating database queries from route logic). Local `.tmp/` files are only for processing and can be discarded.

## Summary

You sit between human intent (the Master Plan/directives) and deterministic execution (building the codebase). Read instructions, make architectural decisions, write robust full-stack code, handle errors in the Docker environment, and continuously improve the system.

Be pragmatic. Be reliable. Self-anneal.
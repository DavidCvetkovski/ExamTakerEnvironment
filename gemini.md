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

## Core Engineering Principles

> These principles are **non-negotiable** and apply to every line of code written in this project. They are shared across all AI agents (see also `claude.md`).

**1. Security First**
- Never trust client input. Validate and sanitize all user-provided data on the backend.
- Use parameterized queries (via SQLAlchemy/Prisma) — never interpolate raw strings into SQL.
- Enforce authorization checks on **every** endpoint: verify the authenticated user has the role *and* ownership to access the resource.
- Store secrets in `.env` only. Never hardcode API keys, database credentials, or JWT secrets.
- Hash passwords with `bcrypt` or `argon2`. Never store plaintext passwords.
- Run the Aikido security gate before every merge to `main` (see `directives/epoch_git_strategy.md`).
- Apply the principle of least privilege: each role should only have access to the endpoints and data it needs.

**2. Maintainability & Clean Code**
- Separate concerns: route handlers should **not** contain business logic. Delegate to service modules.
- Use descriptive names. A function called `get_items` is better than `fetch_data`. A variable called `selected_learning_objects` is better than `items`.
- Keep functions short and focused. If a function exceeds 40 lines, consider splitting it.
- Write docstrings for all public functions and API endpoints.
- Type everything: Pydantic models on the backend, TypeScript interfaces on the frontend. Avoid `any`.

**3. Modularity**
- Each feature should be self-contained in its own module (model + schema + service + endpoint + tests).
- Avoid circular imports. Use dependency injection patterns.
- Frontend: one Zustand store per domain (auth, exam, authoring, library, blueprint). Keep stores lean — complex logic belongs in hooks or utility functions.
- Backend: one service file per domain. Endpoints call services. Services call the database.

**4. Scalability**
- Design database schemas for read-heavy workloads (add indexes on foreign keys and commonly queried fields).
- Use JSONB for flexible, denormalized data (like frozen exam snapshots) but keep relational integrity where it matters (foreign keys, status enums).
- Prefer bulk operations over N+1 loops (e.g., batch-insert interaction events, not one-at-a-time).
- Design APIs for pagination from day one. Never return unbounded lists.

**5. Industry Standards**
- Follow REST conventions: `GET` for reads, `POST` for creates, `PATCH` for updates, `DELETE` for deletes. Use proper HTTP status codes.
- Use Conventional Commits for all git messages (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).
- Write tests alongside features, not after. Minimum: one happy-path test and one error-case test per endpoint.
- Use environment-based configuration (`.env`) with sane defaults for local dev.

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

**5. Plan before you code**
Never start implementing a feature without an approved blueprint in `directives/`. Read the relevant epoch blueprint, understand the data flow, and confirm the approach before writing code. Premature implementation creates rework.

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

Be pragmatic. Be reliable. Self-anneal. Prioritize security.
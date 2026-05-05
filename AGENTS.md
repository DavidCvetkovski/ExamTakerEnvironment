# OpenVision — Engineering Principles & Agent Contract

> This file defines the core engineering principles for **all AI agents** working on the OpenVision codebase. These are non-negotiable constraints that apply to every commit, every endpoint, and every component.

## 1. Security

- **Never trust client input.** Validate all request bodies with Pydantic models on the backend. Sanitize HTML output with DOMPurify on the frontend.
- **Authorization on every endpoint.** Every route must verify: (a) the user is authenticated, (b) the user's role permits the action, and (c) the user owns or has legitimate access to the resource.
- **Parameterized queries only.** Use SQLAlchemy or Prisma ORM methods. Never interpolate strings into SQL.
- **Secrets management.** All credentials live in `.env`. Never hardcode tokens, passwords, or connection strings. `.env` is in `.gitignore`.
- **Password hashing.** Use `bcrypt` or `argon2`. Never store or log plaintext passwords.
- **JWT best practices.** Short-lived access tokens. Refresh tokens with rotation. Tokens must be validated on every protected request.
- **Security gate.** Run Aikido scan before every merge to `main`. Zero Critical/High issues before merge proceeds.
- **Least privilege.** Students cannot access authoring endpoints. Constructors cannot approve items. Enforce at the middleware/dependency level.

## 2. Maintainability & Clean Code

- **Separation of concerns.** Route handlers → Service functions → Database queries. No business logic in route files.
- **Naming conventions.**
  - Python: `snake_case` for functions/variables, `PascalCase` for classes.
  - TypeScript: `camelCase` for functions/variables, `PascalCase` for components/interfaces.
  - Files: `kebab-case` for frontend files, `snake_case` for backend files.
- **Function size.** If a function exceeds ~40 lines, decompose it. Each function should do one thing.
- **Docstrings & comments.** All public API functions must have docstrings. Use comments to explain *why*, not *what*.
- **Type safety.** Backend: strict Pydantic models for request/response. Frontend: TypeScript interfaces. Avoid `any` — use `unknown` with narrowing if needed.
- **No dead code.** Remove unused imports, commented-out code blocks, and placeholder TODOs before merging.

## 3. Modularity

- **Feature-scoped modules.** Each domain (auth, items, sessions, interactions, blueprints) has its own:
  - `models/` — SQLAlchemy model
  - `schemas/` — Pydantic DTOs
  - `services/` — Business logic
  - `api/endpoints/` — Route handlers
  - `tests/` — Pytest test file
- **Frontend stores.** One Zustand store per domain. Stores manage state and API calls. Complex derived logic lives in custom hooks.
- **No circular imports.** Use dependency injection and interface-based contracts.
- **Reusable components.** UI components should be self-contained. Avoid prop-drilling beyond 2 levels — use stores or context instead.

## 4. Scalability

- **Database design.**
  - Add indexes on all foreign key columns and frequently filtered fields.
  - Use JSONB for denormalized snapshots (e.g., frozen exam items), but maintain relational integrity with foreign keys where needed.
  - Design for read-heavy loads: the exam-taking path will have far more reads than writes.
- **Bulk operations.** Prefer batch inserts/updates over loops. E.g., heartbeat events should be flushed in bulk, not one-at-a-time.
- **Pagination.** Every list endpoint must support pagination. Never return unbounded result sets.
- **Stateless API.** All session state lives in the database or JWT. The API server itself is stateless and horizontally scalable.

## 5. Industry Standards

- **REST conventions.** Proper HTTP methods (`GET`, `POST`, `PATCH`, `DELETE`) and status codes (`201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`).
- **Conventional Commits.** `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:` prefixes on all commit messages.
- **Test-driven verification.** Every feature needs at minimum:
  - 1 happy-path test
  - 1 error/edge-case test
  - Integration test for cross-module flows
- **Environment configuration.** Use `.env` with fallback defaults. Never rely on hardcoded config values.
- **Git workflow.** Feature branches per Epoch. Stage-gate commits. Security scan before merge. See `directives/epoch_git_strategy.md`.

## 6. Plan Before You Code

- **No premature implementation.** Every Epoch requires an approved blueprint in `directives/` before any code is written.
- **Read the directive first.** Before touching a file, understand the data flow, the existing models, and the intended architecture.
- **Track in Linear.** Every task, bug, and feature is a Linear issue. If it's not tracked, it doesn't exist.

---

## Tech Stack Reference

| Layer       | Technology                     | Notes                             |
|-------------|--------------------------------|-----------------------------------|
| Frontend    | Next.js 14 (App Router)        | TypeScript, React 18              |
| State       | Zustand                        | Per-domain stores                 |
| Editor      | TipTap                         | Rich text with KaTeX, Lowlight    |
| Styling     | Tailwind CSS                   | Utility-first                     |
| Backend     | FastAPI                        | Python 3.14, async endpoints      |
| ORM         | SQLAlchemy + Prisma Client     | SQLAlchemy for models, Prisma for queries |
| Database    | PostgreSQL                     | JSONB for flexible data           |
| Auth        | JWT (access + refresh tokens)  | bcrypt password hashing           |
| Testing     | Pytest (backend), Playwright (E2E) |                              |
| DevOps      | Docker Compose                 | Local dev environment             |
| Security    | Aikido                         | SAST scanning before merge        |
| VCS         | Git + GitHub                   | Conventional Commits              |
| Planning    | Linear                         | Issue tracking, milestones        |

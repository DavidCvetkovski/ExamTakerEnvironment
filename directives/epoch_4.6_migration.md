## Epoch 4.6: Migration to Industry Standard Services

### Overview

**Goal:** Elevate OpenVision from a development prototype to an industry-standard, scalable platform by migrating the data layer to Prisma, introducing Redis for high-concurrency session management, and implementing full-stack type safety.

**Key Drivers:**
- **Developer Velocity**: Faster database changes and visual management via Prisma Studio.
- **Scale**: Handling thousands of concurrent students via Redis session caching.
- **Reliability**: Eliminating "type drift" between Backend and Frontend.

---

### Phase 1 – The Prisma Transition (Data Layer)

**Objective:** Replace SQLAlchemy/Alembic with Prisma for more robust data modeling and an improved developer experience.

**Tasks:**
- **1.1 Environment Setup**:
  - Install `prisma` and `@prisma/client` in `frontend/`.
  - Install `prisma` (Python client) in `backend/`.
- **1.2 Database Introspection**:
  - Run `npx prisma db pull` to introspect the current PostgreSQL schema.
  - Refine the generated `schema.prisma` file (add proper relations, map names).
- **1.3 Client Generation**:
  - Set up `npx prisma generate` in the `dev-up.sh` workflow.
- **1.4 Service Migration**:
  - Refactor `items_service.py` and `blueprint_service.py` to use the `Prisma` client instead of `SQLAlchemy`.
- **1.5 Prisma Studio**:
  - Add a npm script to easily launch Prisma Studio for visual DB management.

**Exit Criteria:**
- `schema.prisma` accurately reflects the current database state.
- Primary services (`items`, `blueprints`) are fetching data via Prisma.
- Prisma Studio is accessible and functional.

---

### Phase 2 – Live Session Performance (Redis)

**Objective:** Move high-frequency read/write operations (active exam sessions) to Redis to ensure the UI remains responsive under load.

**Tasks:**
- **2.1 Infrastructure**:
  - Add `redis` to `docker-compose.yml`.
  - Set up Redis connection pool in `backend/app/core/redis.py`.
- **2.2 Session Caching**:
  - Modify `exam_sessions_service.py` to cache "Freezed" sessions in Redis once started.
  - Implement a write-through or periodic-sync strategy to keep PostgreSQL updated.
- **2.3 Answer Buffering**:
  - Redirect student answer saves to Redis first, then batch updates to the DB.

**Exit Criteria:**
- Redis is running in the Docker environment.
- Active exam sessions are retrieved from Redis, reducing DB load.

---

### Phase 3 – Full-Stack Type Safety (OpenAPI + Prisma)

**Objective:** Eliminate manual TypeScript interface creation in the frontend.

**Tasks:**
- **3.1 Automated Client Generation**:
  - Use `openapi-typescript-codegen` or similar to generate a TS client directly from FastAPI.
- **3.2 Prisma Types in Frontend**:
  - Use Prisma-generated types for complex data shapes (Rules, ItemVersions) in Zustand stores.
- **3.3 store Cleanup**:
  - Refactor `useBlueprintStore` and `useExamStore` to use these generated types.

**Exit Criteria:**
- Changing a Pydantic schema in the backend triggers a type error in the frontend if not aligned.
- `AvailableItem` and `TestDefinition` types are derived from the single source of truth.

---

### Phase 4 – Infrastructure & DX Hardening

**Objective:** Ensure the migration is seamless for the whole team and production-ready.

**Tasks:**
- **4.1 Startup Update**:
  - Update `dev-up.sh` to handle Redis startup and Prisma generation.
- **4.2 Seeding Migration**:
  - Update `seed_selective.py` to use Prisma for cleaner, more reliable test data generation.

**Exit Criteria:**
- `./dev-up.sh` successfully boots the entire migrated stack.
- Seeding works perfectly with the new Prisma-backed services.

---

### Verification Plan

- **Automated Tests**:
  - Run existing `pytest` suite ensuring Prisma services return identical data shapes to SQLAlchemy.
  - Run Playwright E2E tests to verify "Smart Rule" selection and "Inspection View" still function.
- **Manual Verification**:
  - Verify Prisma Studio shows all existing Questions.
  - Monitor Redis logs to confirm session data is being cached.

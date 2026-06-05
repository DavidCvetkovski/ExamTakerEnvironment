# OpenVision — Engineering Principles & Agent Contract

> This file defines the core engineering principles for **all AI agents** working on the OpenVision codebase. These are non-negotiable constraints that apply to every commit, every endpoint, and every component.
>
> Sections 1–6 govern engineering practice. Section 7 governs design system discipline (added Epoch 8.4). Section 8 lists conventions established through prior epochs that future work must respect. When in doubt, prefer the convention over inventing a new pattern.

## 1. Security

- **Never trust client input.** Validate all request bodies with Pydantic models on the backend. Sanitize author-supplied HTML through the single `sanitizeExamHtml` helper (`frontend/src/lib/sanitizeHtml.ts`) — never hand-roll a local `DOMPurify.sanitize` config (it drifts from the security-reviewed allow-list + image-source guard). Bound any client-supplied free-form payload before persisting it (size/key caps), e.g. self-heal `context`.
- **Authorization on every endpoint.** Every route must verify: (a) the user is authenticated, (b) the user's role permits the action, and (c) the user owns or has legitimate access to the resource.
- **Parameterized queries only.** Use SQLAlchemy or Prisma ORM methods. Never interpolate strings into SQL.
- **Secrets management.** All credentials live in `.env`. Never hardcode tokens, passwords, or connection strings. `.env` is in `.gitignore`.
- **Password hashing.** Use `bcrypt` or `argon2`. Never store or log plaintext passwords.
- **JWT best practices.** Short-lived access tokens. Refresh tokens with rotation. Tokens must be validated on every protected request.
- **Security review.** Perform a manual security review of the diff before every merge to `main` (e.g. the `/security-review` skill, or a deliberate read of the changed surface against §1). Resolve any high-severity findings before merge proceeds. _(The Aikido SAST gate was retired once the subscription lapsed — there is no automated scan; the review is a human responsibility now.)_
- **Least privilege.** Students cannot access authoring endpoints. Constructors cannot approve items. Enforce at the middleware/dependency level.
- **Role is never client-assignable on self-service paths.** Public `/auth/register` forces `STUDENT` — the role is absent from `RegisterRequest` and set server-side. Privileged accounts come only from the seed path or an admin-gated flow. (A `role` field on a public registration body is a direct privilege-escalation footgun.)
- **Role check ≠ ownership check.** A `require_role` / `_require_instructor_or_admin` guard proves _what_ the caller is, not _which_ resources they may touch. Every instructor-scoped route that reads or mutates a specific test's data **must also** call `assert_test_access(test_definition_id, current_user)` (ADMIN sees all; CONSTRUCTOR only their own tests). Apply it on **reads and writes alike** — see §8.8.
- **Frontend disables are advisory; backend `403` is authoritative.** Never rely on a disabled button to prevent mutation — assert the rule in the service layer.

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
- **Single source of truth per concept.** When the same logic appears in three places (e.g., status derivation, permission checks, time formatting), extract it. Three is the limit, not five.

## 3. Modularity

- **Feature-scoped modules.** Each domain (auth, items, sessions, interactions, blueprints) has its own:
  - `models/` — SQLAlchemy model
  - `schemas/` — Pydantic DTOs
  - `services/` — Business logic
  - `api/endpoints/` — Route handlers
  - `tests/` — Pytest test file
- **Frontend stores.** One Zustand store per domain. Stores manage state and API calls. Complex derived logic lives in custom hooks or pure utility functions under `src/lib/`.
- **Pure utilities live in `src/lib/`.** Permission checks, status derivation, time formatting, color hashing, etc. No React imports — just functions in, values out.
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
- **Conventional Commits.** `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:` prefixes on all commit messages. Epoch prefix in scope: `feat(8.4): ...`.
- **Test-driven verification.** Every feature needs at minimum:
  - 1 happy-path test
  - 1 error/edge-case test
  - Integration test for cross-module flows
- **Environment configuration.** Use `.env` with fallback defaults. Never rely on hardcoded config values.
- **Git workflow.** Feature branches per Epoch. Stage-gate commits. Manual security review before merge. See `directives/epoch_git_strategy.md`.

## 6. Plan Before You Code

- **No premature implementation.** Every Epoch requires an approved blueprint in `directives/` before any code is written.
- **Read the directive first.** Before touching a file, understand the data flow, the existing models, and the intended architecture.
- **Track in Linear.** Every task, bug, and feature is a Linear issue. If it's not tracked, it doesn't exist.
- **Check `directives/todo.md`.** Items deferred from past epochs live there. Before opening a new Epoch, review whether any deferred items now belong in scope.

---

## 7. Design System

> The whole UI must work in three themes (`dark`, `warm`, `light-blue`) without code branching. Token discipline is the contract.

### 7.1 Color tokens — no exceptions

- **Never write `text-blue-500`, `bg-red-400`, `border-cyan-300`, etc.** in component or page code. These literal Tailwind colors do not adapt to themes.
- **Always use the design tokens** defined in `frontend/src/app/globals.css`. Examples:
  - Surfaces: `bg-shell-bg`, `bg-shell-surface`, `bg-shell-input`, `bg-shell-input-alt`.
  - Text: `text-foreground`, `text-shell-muted`, `text-shell-muted-dim`.
  - Borders: `border-shell-border`, `border-shell-border-deep`.
  - Brand & accents: `text-brand`, `bg-brand`, `border-brand`, `bg-brand/10` (opacity modifiers OK).
  - Semantic: `text-[var(--color-danger-fg)]`, `bg-[var(--color-warning-bg)]`, `border-[var(--color-success-border)]`.
- **Charts and data-viz** must add their own token families (`--color-chart-series-1`, `-2`, …) — never inline colors.
- **Audit command before merge:**
  ```bash
  grep -rE "(border|bg|text)-(blue|cyan|red|green|yellow|orange|purple|pink|indigo|amber|lime|emerald|teal|sky|violet|fuchsia|rose|slate|gray|zinc|neutral|stone)-[0-9]" frontend/src/app frontend/src/components
  ```
  Result must be empty (or match a documented exception in this file).

### 7.2 Typography — no decorative glyphs

- **No emoji in UI.** 📚, 🧪, 🎯, ⚠, ✗, ✓ as text-content emoji are banned.
- **Functional Unicode is OK** when used as monochrome typography: `↑ ↓` for sort arrows, `→` for forward action, `—` em-dash, `…` ellipsis (single character, not `...`). Use sparingly.
- **Icons are SVG components** — `<XIcon />`, `<AlertIcon />`, `<CheckIcon />` etc. — never text emoji.

### 7.3 Component primitives — use what exists

Before adding inline JSX for any of these, **check `src/components/ui/` first.** If it exists, use it. If it doesn't, add it there (don't inline).

| Need | Use |
|---|---|
| Loading spinner | `<Spinner size="md" tone="brand" />` — never inline `animate-spin` divs |
| Page wrapper | `<PageShell width="wide|standard|narrow">` — never reinvent the wrapper |
| Back nav | `<BackButton href={...} label={...} />` — never inline an arrow SVG |
| Status pill | `<Badge tone="...">` for generic; `<BlueprintStatusBadge>` for blueprint state |
| Row overflow actions | `<RowActionMenu items={...} />` for tables with 3+ row actions |
| User identity | `<Avatar email={...} />` |
| Empty list | `<EmptyState title="..." description="..." />` |
| Confirm dialog | `useConfirm()` hook + `<ConfirmDialog />` |
| Toast | `useToast()` hook |

### 7.4 Radius scale

A single hierarchy. Do not introduce new radii.

| Radius | Use case |
|---|---|
| `rounded-sm` | Small chips, dots |
| `rounded-md` | Buttons |
| `rounded-lg` | Internal small surfaces (date-picker cells, toolbar buttons) |
| `rounded-xl` | Cards, inputs, table containers, banners |
| `rounded-2xl` | Modals, hero panels |
| `rounded-full` | Pills, avatars, status dots |

### 7.4.1 z-index scale

A single hierarchy. Do not introduce magic-number z-indexes (`z-[9999]`, `z-[100]`, etc).

| Layer | Tailwind class | Use case |
|---|---|---|
| Base | (none) | Default page content |
| Sticky surfaces | `z-30` | `GlobalHeader`, exam timer header |
| Drawers | `z-40` | Side-panel overlays (e.g., `CourseEnrollmentDrawer`) |
| Modals & popovers | `z-50` | Modal dialogs, date/time pickers, action menus |
| Toasts | `z-[60]` | Notifications — above everything except hard-error overlays |

### 7.5 Spacing & layout

- **Page widths** (via `<PageShell width>`):
  - `narrow` = `max-w-4xl` — forms, single-column reading (author, exam-take, home dashboard).
  - `standard` = `max-w-5xl` — drill-down detail pages (grading session, my-results).
  - `wide` = `max-w-[1400px]` — data tables and grids (items, sessions, grading list, blueprints, analytics index).
- **Documented exceptions:** `/login` (centered hero) and `/exam/[id]` (full-bleed focus mode) bypass `PageShell` deliberately. `GlobalHeader` and the `/analytics/tests/[testId]` full-bleed sticky header set their own max-width to align with page content (`max-w-[1400px]` / `max-w-6xl` respectively) — they are not pages, so they cannot use `PageShell`. New exceptions require justification in the PR.
- **Padding inside PageShell:** `px-4 sm:px-6 lg:px-8 py-8`. Compact mode `py-6` allowed for detail pages.
- **Component spacing:** prefer `gap-` over `space-x-`/`space-y-` for flex/grid children. Vertical rhythm in stacks: `space-y-6` for major sections, `space-y-4` for grouped controls, `space-y-3` for tight groups.

### 7.6 Eyebrow rule

- **Eyebrows are nav cues, not decoration.** Add an eyebrow only when it communicates location context the title alone doesn't (e.g., `Student portal` on `/my-exams`).
- **Banned eyebrows:** "Educator workspace", "Item bank", "Authoring workbench", "Psychometric analysis" — the title already says everything.

### 7.7 Inspect ≠ Edit

When a surface has both editable and read-only modes:
- **Don't render the same form with `disabled`.** Render a structurally different component (e.g., `BlueprintInspector` vs the editor).
- **Read-only TipTap** sets `editor.setEditable(false)`, hides the toolbar, removes the caret. The `editable` prop on `TipTapEditor` is the contract.
- **Hide mutation buttons rather than disable them.** A disabled "Save" button is a footgun; a missing one is a clear signal.

### 7.8 Sort & filter UX

- **Tables always have an active sort.** No "unsorted" state. Default to the first sortable column ascending.
- **`SortArrow` renders only `↑` or `↓`.** No `↕` glyph — if a column is sortable but inactive, the arrow is muted; clicking activates it.
- **Use the shared `SortArrow` (`components/ui`) and `useTableSort` (`hooks/`).** Never re-implement the arrow component or the `sortKey`/`sortDir` toggle inline — `useTableSort(initialKey)` returns `{ sortKey, sortDir, toggle }` and enforces the active-sort rule in one place.
- **Filter chips are persisted per surface** via Zustand `persist` when filter state spans navigation events.

### 7.9 Lifecycle vocabulary (canon)

Anything with a temporal lifecycle uses these labels — UI labels only; DB enums can differ.

| State | Label | Meaning |
|---|---|---|
| `NEW` | `New` | Never been used / never scheduled |
| `SCHEDULED` | `Scheduled` | Has a future planned occurrence |
| `ONGOING` | `Ongoing` | Currently active |
| `COMPLETED` | `Completed` | Finished normally |
| `CANCELED` | `Canceled` | Ended prematurely |

Do **not** introduce parallel vocabulary (`Planned`, `Past`, `Done`, `Archived`) for the same concepts.

### 7.10 Toast & message copy

- **Toast title:** sentence case, 1–4 words, no terminal punctuation. Examples: `Question saved`, `Session canceled`, `Question duplicated`, `ID copied`.
- **Toast description:** optional. Full sentence with terminal period. Use it to explain *why* or *what next*. Example: `Students can join at the set start time.`
- **Never embed context in titles** with em-dashes or commas. Split into title + description.
- **Confirm dialogs:** title is a question (`Cancel this session?`); message states consequences (`This will prevent students from joining. This action cannot be undone.`); confirm label is the action verb (`Yes, cancel`), not `OK`.
- **Empty states:** title is a noun phrase (`No scheduled sessions yet`); description is one sentence suggesting next step (`Schedule one using the form above.`).

### 7.11 Date & time formatting

| Surface | Format | Util |
|---|---|---|
| Recent past (< 7 days) | `Just now`, `5 minutes ago`, `Yesterday` | `formatRelativeTime(date)` |
| Older past | `Mar 12, 2026` | `formatAbsolute(date)` |
| Future / scheduled | `Mar 12, 14:30` (or relative if < 24h) | `formatScheduled(date)` |
| Audit logs, tooltips | Full ISO-like `Mar 12, 2026 at 14:30:45` | `formatAbsolute(date, { withSeconds: true })` |

All four functions live in `frontend/src/lib/relativeTime.ts`. Direct `toLocaleString()` calls in components are banned — always go through the util.

### 7.12 Theme matrix

Before declaring any visual change complete, verify against all three themes:
- `dark` (default)
- `warm`
- `light-blue`

Toggle via the global `ThemeToggle` in the header. New surfaces must look right under all three with **zero code branching** — any difference must be reachable through token overrides in `globals.css`.

---

## 8. Established Conventions (from prior epochs)

> Patterns that have been put in place by specific epochs and must be respected by future work.

### 8.1 Blueprint status semantics (Epoch 8.4)

- **Source of truth:** `backend/app/services/blueprint_status_service.derive_blueprint_status(test_id) -> BlueprintStatus`.
- **States:** `NEW`, `SCHEDULED`, `ONGOING`, `PASSED`. Priority for single-label display: `ONGOING > PASSED > SCHEDULED > NEW`.
- **Mutability:** `NEW` and `SCHEDULED` are editable; `ONGOING` and `PASSED` are not. Frontend uses `lib/blueprintPermissions.ts`; backend uses `_assert_blueprint_mutable` (route layer) which calls the service.
- **Never duplicate this derivation.** New consumers go through the helper.

### 8.2 Question/Blueprint lock semantics (Epoch 8.3)

- A learning object is "locked" iff it is referenced by a blueprint whose status is `ONGOING` or `PASSED` (Epoch 8.4 refinement).
- Frontend derives `lockedQuestionIds: Set<string>` from `useBlueprintStore.usageMap` — O(1) lookup, no extra API call.
- Backend mutation guards in `items_service.py` enforce the same rule on update/delete.

### 8.3 Import-draft persistence (Epoch 8.3)

- `useImportStore` uses Zustand `persist` middleware backed by `sessionStorage` (not `localStorage` — drafts shouldn't survive a browser restart).
- The blueprint list redirects to `/import` when a draft is in progress, so navigation always returns the user to their work.

### 8.4 Back navigation (Epoch 8.3 / refined 8.4)

- Canonical position: top-left of the page, before `PageHeader`.
- Source: `<BackButton>` component (Epoch 8.4). No inline SVG arrows.
- When the page has unsaved changes (`isDirty`), `confirmDirty` prop triggers `useConfirm` before navigating.
- Origin-aware: read `from` query param to choose destination.

### 8.5 Subject color coding (Epoch 8.4)

- Deterministic hash via `lib/subjectColor.ts` → one of 8 theme-bound tones (`--color-subject-1` through `-8`).
- Same subject string → same color across items page, question picker, and blueprint editor.
- No user-assigned colors. No schema change.

### 8.6 Practice-session return path (Epoch 8.3)

- `exam_sessions_service.get_return_path('PRACTICE') == '/blueprint'`.
- `exam_sessions_service.get_return_path('ASSIGNED') == '/my-exams'`.
- Single source. Frontend `SubmissionConfirmation` reads `return_path` from the session payload — never hardcodes.

### 8.7 Duplicate question (Epoch 8.3)

- Endpoint: `POST /learning-objects/{lo_id}/duplicate`.
- Service: `items_service.duplicate_learning_object` — copies latest version's content, options, metadata (minus `review_feedback`).
- Always available, even on locked questions (duplicating is read-only against the source).

### 8.8 Grading authorization, shared table & grade-state utilities (Epoch 15)

- **Object-level grading authorization.** Every instructor-scoped grading/analytics
  route pairs its role guard with `assert_test_access(test_definition_id, current_user)`
  (`services/run_filter.py`) — on the manual-grade write (`PATCH /grading/grades/{id}`),
  the result read (`GET /grading/sessions/{id}/result`), and the scoring-config write
  (`PATCH /grading/tests/{id}/scoring-config`), not just the list reads. When adding a
  grading route, copy this pairing; a role check alone is a cross-tenant hole.
- **Grade-state is derived once.** "Has this question been graded?" comes from
  `lib/gradeState.deriveGradeState` / `isAwaitingGrade` (authoritative signal:
  `updated_at`, the M-12 rule). Never re-derive it inline from `feedback`/`points`/`is_correct`
  — that drift is how a 0-point essay once read as graded, ungraded, and pending at once.
- **Student display name** comes from `lib/studentLabel.formatStudentLabel` (email
  local-part → `Jane Doe`). Blind mode is enforced **client-side** (advisory, like the
  dashboard) — the API may return `student_email`; the UI hides it when `blindMode` is on.
- **Shared grading components** live in `components/grading/`: `AnswerChoiceList` (the
  one MCQ option renderer, used by both grading review and student results),
  `AutoGradeResult`, `EssayGradingPanel`. Don't re-inline answer rendering in a page.

### 8.9 Self-heal incident store (Epoch 15)

- **Runtime faults and user feedback are captured as structured, deduplicated data** in
  `self_heal_incidents` (Prisma) via `services/self_heal_service` + `SelfHealCaptureMiddleware`
  + `POST /feedback`. Capture is **best-effort** — it must never raise into the request
  path or change the user-visible error. Incidents dedupe by `fingerprint`
  (`source, title, normalized-path`); recurrences bump `occurrences`. PII-light: store
  `user_role` only, never user id / query values / bodies. See
  `directives/epoch_15_self_heal_blueprint.md`. A full bug/UX/structure audit of the
  grading surfaces lives in `directives/epoch_15_grading_ux_audit.md`.

---

## Tech Stack Reference

| Layer       | Technology                     | Notes                             |
|-------------|--------------------------------|-----------------------------------|
| Frontend    | Next.js 14 (App Router)        | TypeScript, React 18              |
| State       | Zustand                        | Per-domain stores, `persist` middleware where needed |
| Editor      | TipTap                         | Rich text with KaTeX, Lowlight    |
| Styling     | Tailwind CSS                   | Utility-first, design tokens in `globals.css` |
| Themes      | `data-theme` on `<html>`       | `dark` / `warm` / `light-blue`; scoped overrides via `data-theme-scope` |
| Backend     | FastAPI                        | Python 3.14, async endpoints      |
| ORM         | SQLAlchemy + Prisma Client     | SQLAlchemy for models/enums/types only; Prisma for queries |
| Database    | PostgreSQL                     | JSONB for flexible data           |
| Schema/Migrations | Prisma (`prisma db push`) | **Single source of truth = `prisma/schema.prisma`.** Dev (`dev-up.sh`) and CI both apply it via `prisma db push`. **There is no Alembic** — it was removed in Epoch 8.9.1 (it had drifted out of sync). Do not reintroduce it. |
| Auth        | JWT (access + refresh tokens)  | bcrypt password hashing           |
| Testing     | Pytest (backend), Playwright (E2E) |                              |
| DevOps      | Docker Compose                 | Local dev environment             |
| Security    | Manual review                  | Diff reviewed against §1 before merge (no automated SAST) |
| VCS         | Git + GitHub                   | Conventional Commits              |
| Planning    | Linear                         | Issue tracking, milestones        |

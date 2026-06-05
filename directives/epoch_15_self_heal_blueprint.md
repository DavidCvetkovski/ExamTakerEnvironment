# Epoch 15 — Self-Heal: Autonomous Bug-Fix Loop

> **Thesis tie-in.** This epoch turns OpenVision into the substrate for the
> "self-mutating codebase" experiment: the app captures its own faults as
> structured data, and an agentic loop consumes that backlog to propose and
> validate fixes. This blueprint covers **Stage 1 (data collection)** only;
> Stages 2–3 (the agent loop and the merge gate) are scoped but not yet built.

## Why

Today every runtime exception goes to logs/Sentry and every user complaint goes
nowhere structured. There is no queryable, deduplicated backlog of "what is
broken" — which is exactly the input an autonomous fix loop needs. Stage 1
builds that backlog as a first-class domain (`self_heal`).

## Architecture (Stage 1 — shipped)

```
runtime exception ─┐
                   ├─► SelfHealCaptureMiddleware ─┐
user bug report ───┘   POST /feedback ────────────┤
                                                   ▼
                                  self_heal_service.record_*   (best-effort, never raises)
                                                   ▼
                                  self_heal_incidents  (deduped by fingerprint)
                                                   ▼
                                  GET /self-heal/incidents  (admin feed → agent later)
```

### Data model — `self_heal_incidents`
- `source` (`RUNTIME_EXCEPTION | USER_FEEDBACK`), `severity`, `status`.
- `status` is a **repair workflow**: `NEW → TRIAGED → IN_PROGRESS → FIX_PROPOSED
  → RESOLVED` (or `WONT_FIX`). Deliberately *not* the §7.9 temporal lifecycle
  vocabulary — different concept (work queue, not calendar).
- `fingerprint` (unique) collapses recurrences: `(source, title, normalized
  path)`. UUIDs/digits in the path are normalized out so the same fault from
  different rows is one incident with an incremented `occurrences`.
- **PII-light (§1):** stores `user_role` only — never user id, query *values*,
  bodies, or tokens. Only query *keys* land in `context`.

### Capture rules
- Middleware sits innermost (closest to routes) so it sees raw unhandled
  exceptions; handled `HTTPException` responses (4xx) never reach it. It always
  re-raises so FastAPI/Sentry behave unchanged.
- All recording is best-effort: a failure to log is swallowed and logged, never
  surfaced to the user or allowed to mask the original fault.

### Surfaces
- `POST /feedback` — any authenticated user; returns `202 Accepted` (queued, not
  acted on synchronously).
- `GET /self-heal/incidents` — **admin-only**, paginated (`page`/`page_size`),
  filterable by `status`/`severity`/`source`, newest activity first.

## Deferred (decisions intentionally open)

- **Reopen policy.** A fault recurring after `RESOLVED` currently bumps
  `occurrences` but does **not** reopen the row. Whether the agent treats that
  as a regression signal is Stage 2's call.
- **Stage 2 — the agent loop.** Trigger on new `CRITICAL` incidents → work in a
  git worktree (the repo already uses `.claude/worktrees/`) → locate via
  traceback+grep (AST later if needed) → run pytest in Docker → open a PR.
- **Stage 3 — merge gate.** Per the kickoff decision, merge behavior is left as
  a config knob. Default must respect CLAUDE.md §1 (manual security review
  before `main`); a gated auto-merge flag enables the live "watch it fly" demo.
- **Sentry bridge.** `SENTRY_DSN` is already wired in `main.py`; a future
  webhook can feed Sentry issues into the same store.

## Files (Stage 1)
- `prisma/schema.prisma` — `self_heal_incidents` model + 3 enums.
- `backend/app/models/self_heal_incident.py` — SQLAlchemy parity.
- `backend/app/schemas/self_heal.py` — `FeedbackRequest`, `IncidentResponse`,
  `IncidentFeedResponse`.
- `backend/app/services/self_heal_service.py` — capture + dedup + feed.
- `backend/app/middleware/__init__.py` — `SelfHealCaptureMiddleware`.
- `backend/app/api/endpoints/self_heal.py` — `/feedback`, `/self-heal/incidents`.
- `backend/tests/test_self_heal.py` — 8 tests (capture, RBAC, dedup, validation).

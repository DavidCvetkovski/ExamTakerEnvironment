# Epoch 11 Progress Matrix

> Last updated: 2026-06-02
> Purpose: track Epoch 11 (Security: Safe Exam Browser & Proctoring) implementation status across modular slices.

## Current Slice Summary

Full vertical slice implemented end-to-end: server-authoritative SEB integrity,
supervisor monitor + per-attempt interventions, append-only incident log, client
anti-cheat runtime, IP allow-listing, and device-sharing detection. Schema is
pushed to the dev DB and the Prisma client is regenerated. Backend imports
cleanly with all routes wired; 17 proctoring unit tests pass (78 unit total) and
the frontend typechecks with zero errors and a clean §7.1 color-token audit.

Remaining work is operator-time sign-off: validate SEB Config-Key parity against
a real Safe Exam Browser build before enabling `SEB_CONFIG_KEY_ENABLED`, run the
Playwright spec against the dev stack, and complete the manual security-review
sign-off line. See Known Gaps.

## Progress Matrix

| Area | Status | What is Done | Remaining Work | Key Files |
|---|---|---|---|---|
| Data model | Complete | `proctoring_config` JSONB on `test_definitions`; presence/intervention/fingerprint/flag/terminate fields on `exam_sessions`; `proctoring_incidents` table + 4 enums. Pushed via `prisma db push`; SQLAlchemy mirrors added. | — | `prisma/schema.prisma`, `app/models/proctoring_incident.py`, `app/models/{exam_session,test_definition}.py` |
| Proctoring schemas | Complete | `ProctoringConfig` (CIDR/hex validators), `ClientProctoringView` (secret-free), monitor/intervention/incident DTOs, constrained `ClientReportableIncidentType`. | — | `app/schemas/proctoring.py`, `app/schemas/{test_definition,exam_session}.py` |
| Policy resolution | Complete | `resolve_proctoring_config` (single source; NULL ⇒ permissive) + `assert_can_proctor`. | — | `app/services/proctoring/policy.py` |
| SEB integrity (F2) | Complete | `seb_service` (Config-Key + BEK validation, constant-time, URL rebuild, IP allow-list) + `require_seb_integrity` guarding the 4 exam-data endpoints; failure ⇒ CRITICAL incident + flag + 403. | Real-SEB Config-Key parity check before enabling CK mode. | `app/services/proctoring/seb_service.py`, `app/core/dependencies.py`, `app/api/endpoints/{sessions,interactions}.py` |
| `.seb` generation (F3) | Complete | Settings → Config Key → plist; staff + enrollment-gated student download endpoints; CK writer is the only setter of `seb_config_key`. | Confirm `startURL` matches the real launch route; optional encryption later. | `app/services/proctoring/seb_config.py`, `app/api/endpoints/{proctoring,student_sessions}.py` |
| Presence (F4) | Complete | Redis-first `touch` on accepted heartbeat + durable `last_seen_at`; `derive_presence` thresholds from config. | Optional: move `last_seen_at` write into the worker flush (currently API-path). | `app/services/proctoring/presence_service.py`, `app/services/interactions_service.py` |
| Monitor + incidents (F5/F7) | Complete | Paginated `/monitor` + `/incidents`, `record_incident` (CRITICAL ⇒ flag), monitor read model with presence overlay + incident counts. | — | `app/services/proctoring/{monitor_service,incident_service}.py`, `app/api/endpoints/proctoring.py` |
| Interventions (F6) | Complete | extend / pause / resume / terminate (force-submit through existing grading path), each writing a `SUPERVISOR_*` incident; pause-aware heartbeat 409. | — | `app/services/proctoring/intervention_service.py`, `app/services/interactions_service.py` |
| Anti-cheat + fingerprint (F8/F9) | Complete | Client incident endpoint (constrained type, server severity, rate-limited); salted device fingerprint on join with sharing detection; IP allow-list. | — | `app/api/endpoints/interactions.py`, `app/services/exam_sessions_service.py`, `app/core/rate_limit.py` |
| Frontend — exam runtime | Complete | `useProctoring` (context-menu/copy-paste/focus/fullscreen with essay carve-out), `ProctoringGate` (SEB gate + `.seb` download), wired into the exam page; `sebDetection`/`deviceFingerprint` libs. | — | `frontend/src/hooks/useProctoring.ts`, `frontend/src/components/exam/ProctoringGate.tsx`, `frontend/src/lib/{sebDetection,deviceFingerprint}.ts` |
| Frontend — config panel | Complete | Security & Proctoring panel (toggles + IP allow-list) mounted in the blueprint editor; persists via existing save path; server preserves `seb_config_key`. | — | `frontend/src/components/blueprint/ProctoringConfigPanel.tsx`, `frontend/src/app/blueprint/page.tsx`, `frontend/src/stores/useBlueprintStore.ts` |
| Frontend — monitor UI | Complete | `/sessions/[scheduledId]/monitor` page (5s/10s polling, visibility-aware), `MonitorTable`, `IncidentFeed`, `useProctoringStore`; Monitor + Download-SEB row actions; `--color-presence-*` tokens (3 themes). | — | `frontend/src/app/sessions/[scheduledId]/monitor/page.tsx`, `frontend/src/components/proctoring/*`, `frontend/src/stores/useProctoringStore.ts`, `frontend/src/app/globals.css` |
| Tests | Mostly complete | 17 backend unit tests (SEB hash/verify, IP allow-list, policy, client-view, presence) pass; `proctoring.spec.ts` E2E (config panel + monitor route guard). | Run E2E against the dev stack; add worker-path presence integration test. | `backend/tests/unit/test_proctoring_seb.py`, `frontend/tests/e2e/proctoring.spec.ts` |
| Config / docs | Complete | New settings + `.env.example` entries; security-review checklist; ops runbook; this matrix. | Manual security-review sign-off line. | `app/core/config.py`, `.env.example`, `directives/epoch_11_security_review.md`, `docs/operations/proctoring.md` |

## Known Gaps (operator / follow-up)

1. **SEB Config-Key parity** — `SEB_CONFIG_KEY_ENABLED` defaults to `false`
   (BEK-only). Validate the derived Config Key against a real SEB build before
   enabling it in production (implementation directive §6.3).
2. **Backend integration tests** can only run inside the dev-up harness (the
   Python Prisma query engine does not connect in a bare shell — an untouched
   test hits the same error). Run the proctoring integration + E2E suites there.
3. **Manual security-review sign-off** — checklist complete; the diff read +
   sign-off line in `epoch_11_security_review.md` is operator-time.
4. **`PUBLIC_EXAM_URL_BASE` / Nginx path preservation** — must be verified in the
   target deployment (the URL-mismatch failure mode; see the runbook).

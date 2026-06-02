# Epoch 11 — Safe Exam Browser & Proctoring: Security Review

> Merge gate per CLAUDE.md §1 (manual security review of the diff before merge
> to `main`). Complete before merging the Epoch 11 branch.
>
> Legend: `[x]` verified in code/tests · `[ ]` operator action at deploy time.

## A. Authentication & authorization

- [x] **Every new endpoint authenticates.** Supervisor monitor, incident feed,
      `.seb` downloads, and all interventions depend on `get_current_user`
      (directly or via `require_role` / `require_seb_integrity`). No anonymous
      surface was added.
- [x] **Least privilege on supervisor surfaces.** `/scheduled-sessions/{id}/monitor`,
      `/incidents`, `/seb-config` and `/exam-sessions/{id}/{extend,pause,resume,terminate}`
      use `require_role(CONSTRUCTOR, ADMIN)` *and* `assert_can_proctor` as
      defense-in-depth (`app/api/endpoints/proctoring.py`, `services/proctoring/policy.py`).
      Students and reviewers are rejected — covered by `test_proctoring_seb`
      authz cases and the `proctoring.spec.ts` route-guard test.
- [x] **Client incident reporting is owner-scoped.** `POST /sessions/{id}/incidents`
      reuses `_get_session_with_ownership_check`; a student cannot post against
      another student's attempt.
- [x] **Student `.seb` download is enrollment-gated** (`student_sessions.student_seb_config`
      checks an active `course_enrollment` before issuing the file).

## B. SEB integrity (the authoritative control)

- [x] **Enforced server-side, not in the client.** `require_seb_integrity`
      guards all four exam-data endpoints (`get session`, `heartbeat`, `answers`,
      `submit`). The frontend `ProctoringGate` / `isLikelySeb()` is advisory only
      and documented as such — bypassing it still hits a `403`.
- [x] **Constant-time hash comparison.** `seb_service.verify_seb_request` uses
      `hmac.compare_digest`; no early-exit string compare leaks the expected hash.
- [x] **Hash bound to the public URL.** The URL is rebuilt from
      `PUBLIC_EXAM_URL_BASE`, never the internal proxied host (`build_absolute_url`).
      A URL-mismatch test proves a valid key for one URL fails for another.
- [x] **Config Key is server-managed.** Only `seb_config.regenerate_config_key_for_test`
      writes `proctoring_config.seb_config_key`; blueprint create/update preserves
      the stored key (`blueprints_service._proctoring_for_write`) so a malicious
      PATCH cannot inject a forged key.
- [x] **Failure is logged + flagged.** A missing or invalid SEB hash records a
      `CRITICAL` `SEB_HEADER_MISSING`/`SEB_HASH_INVALID` incident, sets
      `flagged_for_review`, and returns `403`.
- [ ] **Config Key parity validated against a real SEB** before
      `SEB_CONFIG_KEY_ENABLED=true` in production (see §6.3 of the implementation
      directive). Ships BEK-only-safe by default (`SEB_CONFIG_KEY_ENABLED=false`).

## C. Input validation & injection

- [x] **All bodies are strict Pydantic.** `ProctoringConfig`, `IncidentReport`,
      `ExtendRequest`. IP allow-list entries are validated with `ipaddress`
      (`ProctoringConfig._validate_cidrs`); keys are hex-validated.
- [x] **Client cannot escalate severity or type.** `IncidentReport.incident_type`
      is a constrained enum (`ClientReportableIncidentType`) that excludes
      `SEB_HASH_INVALID` and every `SUPERVISOR_*` type; severity is assigned
      server-side (`incident_service.client_severity_for`).
- [x] **Parameterized queries only.** All access via Prisma; IP checks via
      `ipaddress`, never string interpolation.
- [x] **Extend is bounded** (`minutes` 1–240) and capped at the scheduled
      `ends_at` by default.

## D. Data protection & privacy

- [x] **Incident log is append-only.** No update/delete endpoint exists; the
      table mirrors `integration_audit_logs`.
- [x] **No PII / secrets in the audit trail.** `record_incident` stores reason
      codes, counts, route, and `actor_id` only. Client `detail` is truncated to a
      single bounded `reason` field; SEB header values, answers, and tokens are
      never written. `client_ip` comes from the trusted proxy header.
- [x] **Device fingerprint is a salted one-way hash** (`exam_sessions_service._hash_fingerprint`
      with `FINGERPRINT_SALT`); raw browser attributes are never stored, and
      sharing detection is **off by default** (`detect_session_sharing=False`).
- [x] **Monitor exposes no answer content** — only identity, presence, current
      question *label*, status, and incident counts.

## E. Scalability / availability (no new DoS)

- [x] **Presence is Redis-first**, off the durable write path; the monitor reads
      Redis with a Postgres `last_seen_at` fallback. No per-request table scan.
- [x] **Monitor + incident endpoints are paginated** (default 50, hard cap 200).
- [x] **Client incident endpoint is rate-limited** (`rate_limit_incident`,
      120/min per user+session) so a chatty reporter cannot flood the table.
- [x] **SEB guard adds one indexed read** and one SHA-256 — no new N+1.

## F. Safe failure modes

- [x] **Global kill switch.** `PROCTORING_ENABLED=false` turns the SEB guard into
      a pass-through without a code change (incident log/monitor remain safe to run).
- [x] **Per-test off-switch.** Setting `require_seb=false` immediately disables
      enforcement for one exam.
- [x] **Best-effort signals never block the exam.** Presence touch, client
      incident reporting, and fingerprint capture all swallow errors.

## Sign-off

- [ ] Reviewer: ________________  Date: __________
- [ ] No unresolved high-severity findings.

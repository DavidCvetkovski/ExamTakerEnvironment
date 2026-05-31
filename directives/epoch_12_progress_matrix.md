# Epoch 12 Progress Matrix

> Last updated: 2026-05-31
> Purpose: durable handoff notes for continuing Epoch 12 implementation after context/credit interruption.
>
> 2026-05-31 update: OIDC **launch validation** (`POST /api/lti/launch`) and
> user/context/resource **mapping** now landed on `feature/epoch-12-lti-canvas`.
> `launch_service.validate_launch` verifies the platform-signed `id_token`
> against a TTL-cached JWKS, enforces the LTI claim set, consumes state
> single-use, maps the user/context/resource, and audits the launch. SIS, QTI,
> deep linking, AGS, and frontend integration pages are still not started.

## Current Slice Summary

Implementation started with the safest foundation slice:

- Additive Prisma schema for LTI, SIS, QTI, and integration audit records.
- Public LTI JWKS endpoint.
- Admin-only LTI platform registration/update/deactivation endpoints.
- Admin-only LTI tool key rotation/list endpoints.
- Encrypted private JWK storage and public-only JWKS publication.
- Append-only integration audit helper.
- Focused tests for platform registration, RBAC, duplicate rejection, tool key rotation, JWKS privacy, and audit rows.

This is not a complete Epoch 12 implementation yet. OIDC launch, deep linking, AGS grade passback, SIS import/export, QTI import/export, and frontend integration pages are still pending.

## Progress Matrix

| Area | Status | What is Done | Remaining Work | Key Files |
|---|---|---|---|---|
| Directive | Complete | Full Epoch 12 implementation directive created. | Keep updated if implementation decisions change. | `directives/epoch_12_lti_canvas_interoperability_implementation.md` |
| Progress tracker | Complete | This handoff matrix updated with OIDC login initiation slice. | Update after each implementation slice. | `directives/epoch_12_progress_matrix.md` |
| Prisma schema | Partial | Added LTI platforms, deployments, tool keys, user links, context/resource links, launch audits, grade passbacks, SIS/QTI job models, integration audit model, and the `lti_oidc_states` model for OIDC state tracking. Pushed to local Postgres. | Re-check relation names before larger merge. | `prisma/schema.prisma` |
| Prisma clients | Complete for current slice | Generated JS and Python Prisma clients after schema changes. | Regenerate after every schema edit. | generated clients |
| LTI platform API | Partial | Added admin platform list/create/update/deactivate endpoints. Create writes deployment rows and audit entry. Duplicate issuer/client rejected. | Add deployment add/update endpoints; add get-by-id endpoint if UI needs it; add launch validation lookup helpers. | `backend/app/api/endpoints/lti.py`, `backend/app/services/lti/platform_service.py`, `backend/app/schemas/lti.py` |
| LTI tool keys/JWKS | Partial | Added key rotation, key metadata list, public JWKS endpoint, RSA JWK generation, private JWK encryption-at-rest, audit entry. JWKS does not expose private fields. | Add key deactivation endpoint with safeguards; add private-key decrypt/sign helper for deep-link and AGS service auth; consider stronger production key management later. | `backend/app/services/lti/jwks_service.py`, `backend/app/api/endpoints/lti.py` |
| Integration audit | Partial | Added append-only helper and schema cleanup support. Platform create, key rotate, and login initiation write audit rows. | Use helper across all future LTI/SIS/QTI actions; add audit list endpoint/admin UI later if needed. | `backend/app/services/integration_audit_service.py`, `prisma/schema.prisma` |
| Router wiring | Complete for current slice | LTI router included in main API router. | Add SIS and QTI routers when implemented. | `backend/app/api/api.py` |
| Config | Partial | Added `LTI_PRIVATE_KEY_ENCRYPTION_KEY` (dev fallback to `SECRET_KEY`) and `FRONTEND_BASE_URL` (default `http://localhost:3000`) used to bounce launches to the SPA resolver. | Epoch 13 should harden production config; document both in `.env.example` when that file is updated. | `backend/app/core/config.py` |
| Backend tests | Partial | Added `test_lti_platforms.py`, `test_lti_oidc.py`, and `test_lti_launch.py` (10 launch tests: student/instructor happy paths + forged signature, expired/replayed state, nonce/aud mismatch, unregistered deployment, unsupported message type, unconfigured course). JWKS fetch is monkeypatched; launches are signed with a locally generated RSA key. LTI + auth suites: 35 passed. | Add deep-linking, AGS, SIS, QTI, and security-focused tests. | `backend/tests/test_lti_launch.py`, `backend/tests/test_lti_platforms.py`, `backend/tests/test_lti_oidc.py`, `backend/tests/conftest.py` |
| LTI OIDC login | Complete for current slice | Implemented state/nonce database persistence under `lti_oidc_states` table, created `LtiLaunchClaims` parser in `claims.py`, implemented `initiate_login` in `launch_service.py`, added GET and POST `/login` endpoints, and verified with OIDC test suite. | Integration into OIDC launch verification (launch endpoint validation). | `backend/app/services/lti/launch_service.py`, `backend/app/services/lti/claims.py`, `backend/app/api/endpoints/lti.py` |
| LTI launch validation | Complete for current slice | Implemented `POST /api/lti/launch`: TTL-cached JWKS fetch (`jwks_client.py`), RS256 signature + aud/iss/exp verification, azp/nonce/deployment/message_type/version claim checks, single-use state consume, and an `lti_launch_audits` row on success/failure. Sets the OpenVision refresh cookie and 302-redirects to the SPA launch resolver. | Deep-link return flow and AGS line-item capture beyond `lineitem` URL are later slices. | `backend/app/services/lti/launch_service.py`, `backend/app/services/lti/jwks_client.py`, `backend/app/api/endpoints/lti.py` |
| LTI user/context/resource mapping | Complete for current slice | `mapping_service.py`: `resolve_lti_user` links by `(issuer,subject)` and provisions never-seen subjects with an unusable password + least-privilege role (never admin, never re-roles an existing link); `resolve_lti_context` records unmapped contexts (no silent course creation); `resolve_lti_resource_link` records/updates links and captures AGS line-item URLs; `ensure_enrollment` upserts learner enrollment. Synthetic non-deliverable email avoids account-takeover on email collision. | Instructor context→course mapping UI and deep-link resource binding are frontend/later slices. | `backend/app/services/lti/mapping_service.py` |
| LTI mapping management API | Complete for current slice | `integration_admin_service.py` + endpoints: admin/constructor `GET`/`PATCH /api/lti/contexts` (bind Canvas context→OpenVision course) and `GET`/`PATCH /api/lti/resource-links` (bind resource link→scheduled session/test definition), with `unmapped_only` filters, existence validation (404s), audit rows, and students 403. This unblocks the learner launch (no more "course not configured"). | Frontend UI; constructor-owns-course ownership scoping deferred. | `backend/app/services/lti/integration_admin_service.py`, `backend/app/api/endpoints/lti.py`, `backend/app/schemas/lti.py`, `backend/tests/test_lti_mapping.py` |
| Deep linking | Not started | Resource-link schema exists. | Implement instructor picker backend, server-side signed deep-link JWT, Canvas return form. | planned LTI services/frontend |
| AGS grade passback | Not started | Grade-passback schema exists. | Implement token acquisition, score push client, result validation, retry records/manual retry. | planned: `grade_passback_service.py`, `platform_client.py` |
| SIS/Osiris | Not started | SIS job schema exists. | Implement roster CSV import, accommodation CSV import reuse, grade CSV export, job row reports, docs. | planned SIS router/services |
| QTI | Not started | QTI job schema exists. | Implement safe XML/ZIP parser, export package generator, import dry-run/commit, sanitization, round-trip tests. | planned QTI router/services |
| Frontend | Not started | None in this slice. | Add `/integrations`, LTI admin UI, launch/deep-link pages, SIS panels, QTI panels, store/types. | planned frontend files |
| Security review | Not started | Directive checklist exists in plan only. | Create `directives/epoch_12_security_review.md` and complete before merge. | planned directive |
| Docs | Not started | None. | Add Canvas setup, SIS CSV, and QTI docs. | planned `docs/integrations/*` |

## Files Added (across Epoch 12 slices)

```text
backend/app/api/endpoints/lti.py
backend/app/schemas/lti.py
backend/app/services/integration_audit_service.py
backend/app/services/lti/__init__.py
backend/app/services/lti/claims.py
backend/app/services/lti/jwks_service.py
backend/app/services/lti/jwks_client.py        # launch slice: platform JWKS TTL cache
backend/app/services/lti/launch_service.py
backend/app/services/lti/mapping_service.py     # launch slice: user/context/resource mapping
backend/app/services/lti/platform_service.py
backend/tests/test_lti_platforms.py
backend/tests/test_lti_oidc.py
backend/tests/test_lti_launch.py                # launch slice
directives/epoch_12_lti_canvas_interoperability_implementation.md
directives/epoch_12_progress_matrix.md
directives/epoch_13_production_hardening_implementation.md
```

## Files Modified by Current Slice

```text
backend/app/api/api.py
backend/app/core/config.py
backend/tests/conftest.py
prisma/schema.prisma
```

Note: the worktree already had many unrelated dirty files before this slice. Do not revert them. Current unrelated dirty examples include `AGENTS.md`, `claude.md`, frontend theme/accessibility files, and existing test-result artifacts.

## Verification Completed

Commands that passed:

```bash
npx prisma@5.17.0 validate --schema=prisma/schema.prisma
PATH=/Users/davidcvetkovski/Documents/Uni/TH/ExamTakerEnvironment/backend/.venv/bin:$PATH backend/.venv/bin/prisma generate --schema=prisma/schema.prisma
PATH=/Users/davidcvetkovski/Documents/Uni/TH/ExamTakerEnvironment/backend/.venv/bin:$PATH backend/.venv/bin/prisma db push --schema=prisma/schema.prisma --accept-data-loss
PYTHONPATH=. .venv/bin/pytest tests/test_lti_platforms.py tests/test_lti_oidc.py -q
PYTHONPATH=. .venv/bin/pytest tests/test_auth.py tests/test_accommodations_admin.py -q
```

Results:

```text
test_lti_platforms.py + test_lti_oidc.py: 9 passed
test_auth.py + test_accommodations_admin.py: 22 passed
```

Warnings observed:

- Passlib emits a Python 3.13 deprecation warning for `crypt`.
- httpx warns about per-request cookies in existing auth tests.

## Important Environment/Permission Notes

- Local Docker services were started with `docker compose up -d`.
- Prisma `db push` required escalated/local network permission to reach Postgres at `localhost:5432`.
- Running pytest against the local DB also required escalated/local network permission.
- Tests must be run from `backend/` with `PYTHONPATH=.` or the `app` module is not found.

## Next Recommended Implementation Slice

Launch validation and user/context/resource mapping are now done. Do this next:

1. Frontend launch resolver: `/lti/launch?next=...` page that exchanges the
   refresh cookie for an access token and routes to the `next` target.
2. Instructor context→course mapping + resource→exam binding UI (so learner
   launches stop hitting "course not configured" / "assignment not linked").
3. Deep linking (Phase 5): instructor picker backend, signed deep-link JWT
   (needs the private-key decrypt/sign helper — still unimplemented), Canvas
   return form. The launch already routes `LtiDeepLinkingRequest` to
   `/integrations/lti/deep-link`.
4. AGS grade passback (Phase 6): token acquisition, score push, retry records.

## Current Known Gaps/Risks

- `LTI_PRIVATE_KEY_ENCRYPTION_KEY` falls back to `SECRET_KEY` in development. Production hardening must require a dedicated secret.
- Private key decrypt/sign helper is not implemented yet, so deep-linking and AGS cannot sign JWTs yet.
- Platform update intentionally does not allow changing `issuer` or `client_id`; if needed, add a separate admin-only rotation path with audit.
- Deployment add/update endpoints are not implemented yet.
- No frontend surface exists yet for the platform APIs.
- No manual security review file exists yet.

## Resume Prompt

Use this prompt to continue cleanly:

```text
Continue Epoch 12 from directives/epoch_12_progress_matrix.md on branch feature/epoch-12-lti-canvas. Do not revert unrelated dirty files. The LTI platform/JWKS foundation, OIDC login initiation, OIDC launch validation (/api/lti/launch), and user/context/resource mapping are implemented and tested (tests/test_lti_launch.py). Start the next slice: the frontend launch resolver and instructor context/resource mapping UI, then deep linking (Phase 5) and AGS passback (Phase 6).
```


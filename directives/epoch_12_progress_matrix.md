# Epoch 12 Progress Matrix

> Last updated: 2026-05-31
> Purpose: durable handoff notes for continuing Epoch 12 implementation after context/credit interruption.
>
> 2026-05-31 verification: matrix re-checked against the tree and still accurate.
> Only the foundation slice exists — `launch_service.py` has `initiate_login`
> only (no `/launch` validation); there are no SIS or QTI services, and no
> frontend integration pages. All "Partial/Not started" rows below hold.

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
| Config | Partial | Added `LTI_PRIVATE_KEY_ENCRYPTION_KEY`, with dev fallback to `SECRET_KEY`. | Epoch 13 should harden production config; Epoch 12 should document this in `.env.example` when that file is updated. | `backend/app/core/config.py` |
| Backend tests | Partial | Added `test_lti_platforms.py` and `test_lti_oidc.py`. Updated cleanup order for new tables. Focused LTI platforms and OIDC login tests pass. Auth/accommodation smoke tests pass. | Add launch, deep-linking, AGS, SIS, QTI, and security tests. | `backend/tests/test_lti_platforms.py`, `backend/tests/test_lti_oidc.py`, `backend/tests/conftest.py` |
| LTI OIDC login | Complete for current slice | Implemented state/nonce database persistence under `lti_oidc_states` table, created `LtiLaunchClaims` parser in `claims.py`, implemented `initiate_login` in `launch_service.py`, added GET and POST `/login` endpoints, and verified with OIDC test suite. | Integration into OIDC launch verification (launch endpoint validation). | `backend/app/services/lti/launch_service.py`, `backend/app/services/lti/claims.py`, `backend/app/api/endpoints/lti.py` |
| LTI launch validation | Not started | None. | Implement `/api/lti/launch`, JWKS fetch/cache, JWT validation, state consume, nonce/aud/iss/deployment/message checks, launch audit. | planned: `backend/app/services/lti/launch_service.py`, `backend/app/services/lti/claims.py` |
| LTI user/context/resource mapping | Not started | Schema exists. | Implement issuer+subject user linking, context mapping, resource link mapping, enrollment on learner launch. Never create admin from LTI. | planned LTI services |
| Deep linking | Not started | Resource-link schema exists. | Implement instructor picker backend, server-side signed deep-link JWT, Canvas return form. | planned LTI services/frontend |
| AGS grade passback | Not started | Grade-passback schema exists. | Implement token acquisition, score push client, result validation, retry records/manual retry. | planned: `grade_passback_service.py`, `platform_client.py` |
| SIS/Osiris | Not started | SIS job schema exists. | Implement roster CSV import, accommodation CSV import reuse, grade CSV export, job row reports, docs. | planned SIS router/services |
| QTI | Not started | QTI job schema exists. | Implement safe XML/ZIP parser, export package generator, import dry-run/commit, sanitization, round-trip tests. | planned QTI router/services |
| Frontend | Not started | None in this slice. | Add `/integrations`, LTI admin UI, launch/deep-link pages, SIS panels, QTI panels, store/types. | planned frontend files |
| Security review | Not started | Directive checklist exists in plan only. | Create `directives/epoch_12_security_review.md` and complete before merge. | planned directive |
| Docs | Not started | None. | Add Canvas setup, SIS CSV, and QTI docs. | planned `docs/integrations/*` |

## Files Added in Current Slice

```text
backend/app/api/endpoints/lti.py
backend/app/schemas/lti.py
backend/app/services/integration_audit_service.py
backend/app/services/lti/__init__.py
backend/app/services/lti/claims.py
backend/app/services/lti/jwks_service.py
backend/app/services/lti/launch_service.py
backend/app/services/lti/platform_service.py
backend/tests/test_lti_platforms.py
backend/tests/test_lti_oidc.py
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

Do this next, in order:

1. Implement `/api/lti/launch` OIDC launch endpoint:
   - Load OIDC state row, verify it is not expired and not consumed.
   - Decode/verify the LTI `id_token` JWT signature using platform public JWKS.
   - Cache issuer JWKS using a TTL.
   - Verify JWT claims (nonce matches stored nonce, iss, aud, deployment_id is active, message_type is supported).
   - Mark state consumed in database.
2. Implement LTI user mapping/linking service `resolve_lti_user`.
3. Implement LTI context mapping service `resolve_lti_context`.
4. Implement LTI resource link mapping service `resolve_lti_resource_link`.
5. Add backend tests for OIDC launch validation and user/context/resource mapping.

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
Continue Epoch 12 from directives/epoch_12_progress_matrix.md. Do not revert unrelated dirty files. The LTI platform, JWKS foundation, and OIDC login initiation endpoints are implemented and fully tested. Start the next slice: implement OIDC launch response validation endpoint (/api/lti/launch) and user/context/resource mapping services.
```


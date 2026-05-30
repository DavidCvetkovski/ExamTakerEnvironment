# Epoch 9 — Account & Settings

> **Status:** Proposed blueprint (per CLAUDE.md §6 — plan before code). Awaiting approval before any code is written.
> **Branch:** `epoch-9-account-settings`
> **Depends on:** Epoch 3 (JWT auth, RBAC, `users` model), Epoch 8.x (design system: `PageShell`, `ui/` primitives, tokens, toasts, confirm dialog).
> **Supersedes on the roadmap:** the Epoch 9 *Multimedia Resource Library* slot. Media upload is **explicitly descoped** — this epoch ships a complete, secure account-settings surface instead so the product reads as "finished" rather than half-built. The media blueprint (`epoch_9_media_library_blueprint.md`) stays on disk for a future epoch; the roadmap row is repointed (Stage 0).

## 1. Motivation

The `/account` page is a placeholder `EmptyState` ("Settings coming soon"). Every
other surface of OpenVision is production-grade, so an empty account page is the
single most visible "unfinished" seam. Meanwhile two account concerns are
genuinely missing, not just unsurfaced:

1. **No way to change a password.** There is no endpoint and no UI. A user who
   wants to rotate a credential cannot. This is a security gap, not a cosmetic one.
2. **No session hygiene.** Even if a password leaks, there is no mechanism to
   invalidate sessions already minted — JWTs simply live until expiry.

What already exists and must be *reused, not rebuilt*:

- **Theme preference is fully wired** end-to-end: `PATCH /api/users/me/preferences/theme`
  → `preferences_service.update_theme_preference` → `users.theme_preference`, and
  `useAuthStore.setThemePreference` with optimistic rollback. The header
  `ThemeToggle` already persists. This epoch **surfaces** it on the account page;
  it does **not** re-implement it.

## 2. Scope (four deliverables)

| # | Deliverable | Surfaces |
|---|---|---|
| F1 | **Change password securely** — verify current password, enforce strength, re-hash with bcrypt | Account page form, `POST /api/auth/change-password`, `users_service`, security core |
| F2 | **Full session invalidation** — a `token_version` claim embedded in every JWT; changing a password (or "sign out everywhere") bumps it, instantly invalidating *all* other outstanding tokens | DB, security core, `get_current_user`, `refresh`, both services |
| F3 | **Account page build-out** — profile card (read-only), appearance/theme row (reusing existing plumbing), security section (password + sign-out-everywhere), danger zone (self-deactivation) | `/account` page + new components |
| F4 | **Sign out everywhere & self-deactivation** — `POST /api/auth/logout-all` and `POST /api/users/me/deactivate`, both gated on re-entering the current password | Account page, endpoints, services |

**Out of scope:** editing email / role / VUnetID (admin-managed identity fields, not
self-service), email-based password *reset* (requires an email transport we do not
have — tracked as TODO-009 below), 2FA, and any media handling.

## 3. Data model

One additive, nullable-safe change: a monotonic **token version** on the user.

### 3.1 Schema change (Prisma — single source of truth)

> **No Alembic.** Per CLAUDE.md Tech Stack & the Epoch 8.9.1 decision, the schema is
> owned by `prisma/schema.prisma` and applied with `prisma db push`. Do not
> reintroduce Alembic.

In `prisma/schema.prisma`, add to `model users`:

```prisma
token_version Int @default(0)
```

- Non-null with a server default `0` → additive, **no data-loss risk** on `db push`
  (every existing row backfills to `0`).
- No index needed: it is only ever read for the already-loaded current user, never
  filtered across the table.

Apply it (mirrors `dev-up.sh`):

```bash
npx prisma@5.17.0 generate --schema=prisma/schema.prisma
npx prisma@5.17.0 db push --schema=prisma/schema.prisma --accept-data-loss
```

### 3.2 SQLAlchemy model (kept for enums/types only)

- `models/user.py`: add `token_version = Column(Integer, default=0, nullable=False)`.
- As established in 8.9.1, SQLAlchemy models are an honest mirror of the Prisma
  schema (used for enums/types and `verify_*` scripts), **not** the migration
  mechanism. Keep the column in sync; do not add migration logic here.

## 4. Backend

### 4.1 The token-version mechanism (F2 — the security spine)

The whole "invalidate everything" capability rests on one rule: **every token
carries the issuing user's `token_version`, and every authenticated read
re-checks it against the database.** A mismatch ⇒ `401`.

**Single source of truth for the claim.** `core/security.py`:

- `build_token_payload` already lives in `users_service`; move/extend so the token
  payload includes `"tv": user.token_version`. To avoid three copies of the claim
  shape (CLAUDE.md §2), the version is added **once** where the payload dict is
  assembled (`users_service.build_token_payload`), and `create_access_token` /
  `create_refresh_token` stay generic (they encode whatever dict they're given).

**Enforcement — one helper, two call sites.** In `core/dependencies.py`:

```python
def _assert_token_version(payload: dict, user) -> None:
    """Reject tokens minted before the user's current token_version."""
    if payload.get("tv", 0) != user.token_version:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
```

- `get_current_user` decodes, loads the user, then calls `_assert_token_version`.
  (Today it decodes inside the dep; we thread the decoded `payload` into the check.)
- `auth.refresh` (route in `api/endpoints/auth.py`) calls the same helper after
  loading the user, so a stale refresh cookie cannot mint a fresh access token.

This is the **single derivation** of "is this token still valid" — no consumer
re-implements the comparison (mirrors the §8.1 "never duplicate the derivation"
discipline).

> **Why a counter, not a timestamp:** an integer bump is atomic, comparison is
> exact, and it needs no clock-skew reasoning. `password_changed_at` would also
> work but invites "is the token older than the change?" timestamp math at every
> request. The counter is the smaller, harder-to-get-wrong primitive.

### 4.2 Change password (F1)

**Schema** — `schemas/auth.py`:

```python
class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, description="Minimum 8 characters")
```

- Strength: reuse the existing `min_length=8` contract from `RegisterRequest` so the
  rule lives in one conceptual place. (If we later harden it — digit+letter+symbol —
  it changes in one Pydantic validator reused by both schemas. Noted as a follow-up,
  not done now, to keep this epoch additive.)

**Service** — `users_service.change_password(user_id, current_password, new_password)`:

1. Load user via Prisma.
2. `verify_password(current_password, user.hashed_password)` — on failure raise
   `400` (not `401`: the session is valid, the *input* is wrong). Generic message
   "Current password is incorrect." — never reveal anything else.
3. Reject if `new_password == current_password` → `400` "New password must be
   different."
4. `prisma.users.update`: set `hashed_password = hash_password(new_password)` **and**
   `token_version = {"increment": 1}` in the same write (atomic — the credential and
   the invalidation move together; a partial failure can't leave a changed password
   with still-valid old sessions).
5. Return the updated user.

**Endpoint** — `POST /api/auth/change-password`, `Depends(get_current_user)`:

- After the service succeeds, the *caller's* token is now also stale (its `tv` no
  longer matches). So the route **re-mints** access+refresh for the current session
  from the updated user (so the active user isn't logged out of the tab they're
  using) and sets the refresh cookie — exactly the `authenticate_user` tail. Every
  *other* device is now dead. Response: `TokenResponse` (same shape as login), so the
  frontend just swaps its in-memory token.

This is the "Full invalidation" model: **change password ⇒ all other sessions die,
current tab stays alive with fresh tokens.**

### 4.3 Sign out everywhere (F4)

`POST /api/auth/logout-all`, `Depends(get_current_user)`:

- Re-verify the current password from the body (`ConfirmPasswordRequest{ password }`)
  → defense in depth for a destructive action; a borrowed unlocked laptop can't nuke
  sessions without the password. Failure ⇒ `400`.
- Service `users_service.bump_token_version(user_id)` → `token_version +1`.
- Re-mint current-session tokens + refresh cookie (same tail as 4.2) so the
  initiating tab survives; everything else dies. Response `TokenResponse`.

### 4.4 Self-deactivation — danger zone (F4)

`POST /api/users/me/deactivate`, `Depends(get_current_user)`:

- Body `ConfirmPasswordRequest{ password }`; re-verify → failure `400`.
- **Guardrail:** an `ADMIN` may not self-deactivate via this route (prevents locking
  the platform out of its last admin) → `403` "Admins cannot deactivate their own
  account." (Matches §1 least-privilege / fail-safe instinct.)
- Service `users_service.deactivate_self(user_id)`: set `is_active = False` **and**
  bump `token_version` (kills sessions immediately). Existing `get_current_user`
  already rejects `is_active = False` with `403`, so no new guard needed elsewhere.
- Endpoint clears the refresh cookie and returns `204 No Content`. Frontend then runs
  its normal `logout()` and routes to `/login`.
- **Deactivate, not delete:** preserves referential integrity (a user authored
  questions, owns results, graded sessions — hard delete would orphan or cascade
  across half the schema). Reversible by an admin. This is the conservative,
  data-safe choice §4 implies.

### 4.5 Module placement (CLAUDE.md §2/§3)

- All business logic in `services/users_service.py` (already the home for
  register/authenticate/refresh). Routes stay thin: validate → call service →
  shape response. No logic in `api/endpoints/auth.py`.
- New endpoints grouped: password + logout-all on the existing `auth` router;
  `deactivate` on a new `users` router (`/api/users/me/...`) to sit beside the
  existing `users/me/preferences` namespace. Register it in `api/api.py`.

### 4.6 Backend tests (`backend/app/tests/`)

Per CLAUDE.md §5 (happy + edge + integration). New `test_account_settings.py`:

- **F1 happy:** change password with correct current pw → `200`, new pw logs in,
  old pw rejected.
- **F1 edge:** wrong current pw → `400`; new == current → `400`; new < 8 chars → `422`.
- **F2 integration (the spine):** mint token A, change password, assert token A now
  → `401` on a protected route (`/auth/me`), while the freshly-returned token works.
- **F2 refresh:** an old refresh cookie → `401` after a version bump.
- **F4 logout-all:** wrong confirm pw → `400`; correct → other token dies, current
  returned token lives.
- **F4 deactivate:** admin self-deactivate → `403`; student deactivate → `204`,
  subsequent `/auth/me` → `403`, login → `403`.

## 5. Frontend

### 5.1 Account page composition (`/account`)

Replace the `EmptyState` with a stacked, sectioned layout inside the existing
`<PageShell width="narrow">` + `<BackButton>` + `<PageHeader>` frame. Sections use
the card pattern already on the page (`rounded-2xl border border-shell-border
bg-shell-surface`). One section component per concern, all under
`frontend/src/components/account/`:

| Section | Component | Contents |
|---|---|---|
| Profile | `ProfileCard` | Existing `Avatar` + email + role + VUnetID. Read-only — a muted note: "Managed by your administrator." |
| Appearance | `AppearanceSection` | Theme picker (4 options: Dark / Warm / Light-blue / Auto) → calls **existing** `useAuthStore.setThemePreference`. No new store, no new endpoint. |
| Security | `SecuritySection` | `ChangePasswordForm` + a "Sign out of all other devices" action (opens a password-confirm dialog). |
| Danger zone | `DangerZone` | "Deactivate account" → `useConfirm` dialog stating consequences + password confirm. |

- **Tokens only** (§7.1): danger zone uses `text-[var(--color-danger-fg)]` /
  `border-[var(--color-danger-border)]`, never literal red. Run the §7.1 audit grep.
- **Primitives** (§7.3): `useToast`, `useConfirm`/`ConfirmDialog`, `Spinner`,
  existing form inputs. No inline spinners or ad-hoc dialogs.
- **Radius/spacing** (§7.4/§7.5): cards `rounded-2xl`, `space-y-6` between sections.
- **Copy** (§7.10): toast `Password changed` / desc "Other devices have been signed
  out."; confirm title "Deactivate your account?", consequence "You'll be signed out
  and won't be able to log in until an administrator reactivates you.", confirm verb
  "Yes, deactivate".

### 5.2 `ChangePasswordForm` (the careful one)

- Three fields: current, new, confirm-new. `type="password"` with a show/hide toggle
  (icon button, SVG per §7.2 — no emoji).
- **Client-side guards mirror the server** but are advisory only (§1: backend is
  authoritative): new ≥ 8 chars, new === confirm, new ≠ current. Submit disabled
  until they pass; the *real* checks are the `400`/`422` paths.
- On success: server returns a fresh `TokenResponse`. Add
  `useAuthStore.applySession(tokenResponse)` (small new action that does what the
  `login` tail does — set token/user/theme — **extracted so login, register, and
  this share one code path**, §2 single-source). Toast success. Clear the form.
- On `400`: surface the server message inline under the relevant field (current-pw
  errors under "current"). Never swallow.

### 5.3 Store additions (`useAuthStore`)

Minimal, reusing existing patterns:

- `applySession(resp)` — extracted token/user/theme setter (refactor `login`,
  `register`, `refreshToken`, `fetchMe` to call it → removes the 4 copies that exist
  today, a §2 win we get for free).
- `changePassword(current, next)` → `POST auth/change-password`, then `applySession`.
- `logoutEverywhere(password)` → `POST auth/logout-all`, then `applySession`.
- `deactivateAccount(password)` → `POST users/me/deactivate`, then local `logout()`.

No new store — all of this is auth-domain (§3 one store per domain).

### 5.4 Frontend tests (Playwright, `frontend/e2e/`)

Following `directives/e2e_seed_naming_conventions.md`. New `account-settings.spec.ts`:

- Change password happy path → success toast, can still navigate (session alive).
- Wrong current password → inline error, no toast.
- Theme picker persists across reload (reads back from `/auth/me`).
- Deactivate flow → confirm dialog → redirected to `/login`, cannot log back in.
- Seed: a dedicated disposable user (e.g. `account-victim@seed.test`) so deactivation
  doesn't poison shared fixtures — per the seed-isolation convention.

## 6. Security review checklist (CLAUDE.md §1 — gate before merge)

- [ ] Current password re-verified on **every** sensitive action (change, logout-all,
      deactivate). Backend `403`/`400` authoritative; disabled buttons advisory only.
- [ ] New hash via `bcrypt` (`hash_password`); plaintext never logged or returned.
- [ ] `token_version` bump and hash update are a **single atomic** Prisma write.
- [ ] Every JWT carries `tv`; `get_current_user` **and** `refresh` re-check it.
- [ ] Generic auth-failure messages (no user enumeration, no "password too close").
- [ ] Admin cannot self-deactivate (fail-safe against lockout).
- [ ] Deactivate is reversible (no hard delete; referential integrity intact).
- [ ] `grep` §7.1 color audit returns empty for new files.
- [ ] Aikido scan: zero Critical/High before merge to `main`.

## 7. Stage plan (stage-gate commits per `epoch_git_strategy.md`)

| Stage | Deliverable | Verification gate | Commit |
|---|---|---|---|
| 0 | Repoint roadmap (Epoch 9 = Account & Settings; media → backlog), drop TODO-009 (email reset) | Roadmap + todo read cleanly | `docs(9): repoint Epoch 9 to account settings` |
| 1 | Schema: `token_version` (Prisma + SQLAlchemy mirror), `db push` | `prisma generate` clean; column present | `feat(9): add token_version for session invalidation` |
| 2 | Token-version spine: claim in payload, `_assert_token_version` in `get_current_user` + `refresh` | Backend tests F2 green | `feat(9): enforce token_version on every authenticated request` |
| 3 | Change-password endpoint + service + re-mint | Tests F1 green | `feat(9): secure password change with full session invalidation` |
| 4 | logout-all + self-deactivate endpoints/services | Tests F4 green | `feat(9): sign-out-everywhere and self-deactivation` |
| 5 | Account page sections + store refactor (`applySession`) | App renders all 3 themes; manual click-through | `feat(9): account settings page (profile, appearance, security, danger zone)` |
| 6 | Playwright `account-settings.spec.ts` | E2E green | `test(9): account settings E2E` |
| 7 | Security checklist §6 + Aikido | Zero Critical/High | merge gate |

## 8. Follow-ups (to `directives/todo.md`)

- **TODO-009 — Email-based password reset.** Self-service "I forgot my password"
  needs an email transport (SMTP/provider) we don't currently run. Out of scope here
  (this epoch covers *authenticated* password change). Promote when an email
  service is provisioned.
- **TODO-010 — Password strength hardening.** Currently `min_length=8` only. A shared
  Pydantic validator (digit + letter + length) reused by register + change would
  raise the floor without duplicating rules. Additive; deferred to keep this epoch
  focused.

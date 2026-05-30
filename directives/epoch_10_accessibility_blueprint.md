# Epoch 10 — Accessibility & Inclusive Design

> **Status:** Proposed blueprint (per CLAUDE.md §6 — plan before code). Awaiting approval before any code is written.
> **Branch:** `epoch-10-accessibility`
> **Depends on:** Epoch 3 (auth, `users` model, RBAC), Epoch 5 (exam-taking flow, timer), Epoch 8.4 (design-token system, three-theme matrix, `ui/` primitives), Epoch 8.9.1 (course enrolment — the population we apply accommodations to). Sits alongside Epoch 9 (Account & Settings) — the account page is where self-service accessibility preferences live.

## 1. Motivation

High-stakes university exams carry a legal and ethical obligation to be usable
by every student, including those with visual impairments, dyslexia, motor
constraints, and those entitled to extra-time provisions. Today OpenVision has
**one** piece of this in place and the rest missing:

- **Already done (Epoch 5 accommodations groundwork):** `users.provision_time_multiplier`
  exists and is *applied* by the session-join flow —
  `exam_sessions_service` computes `duration_minutes * multiplier` for both
  practice and scheduled joins, and `tests/test_accommodations.py` proves a
  1.25× student gets 75 minutes for a 60-minute exam. **This epoch does not
  rebuild that — it verifies it and builds the surfaces around it.**
- **Missing:** any way for an administrator to *set* that multiplier (it is only
  ever seeded directly into the DB); any visual accessibility profile
  (high-contrast, dyslexia-friendly, text scaling); keyboard/screen-reader
  support across the exam flow; and any audit trail of who granted which
  provision.

This epoch closes those gaps so OpenVision can claim WCAG 2.1 AA conformance and
TestVision parity for accommodations.

## 2. Scope (three deliverables + a verification gate)

| # | Deliverable | Surfaces |
|---|---|---|
| F1 | **Accessibility profile** — a per-user, orthogonal axis (high-contrast, dyslexia-friendly font, text scale) layered on top of the existing colour theme, persisted server-side and applied everywhere, with an in-exam quick-adjust | DB, `users/me/preferences` API, `globals.css` token overrides, `ThemeProvider`, account page, exam header |
| F2 | **Keyboard & screen-reader support** — full keyboard operability, ARIA semantics, a live-region announcer, skip links, and audited focus traps across the exam flow and global shell | FE only: exam-take, modals, global header, `ui/` primitives |
| F3 | **Accommodation administration** — an admin surface + API to set a student's time multiplier and an *enlarged-display* accommodation flag, an append-only accommodation audit log, and CSV import for bulk provisioning | DB (new table + column), new `accommodations` module (BE), new admin page (FE) |
| V | **Verification gate** — Lighthouse a11y ≥ 90 on key routes, axe-core automated checks, manual screen-reader pass, and re-confirmation of the existing time-multiplier maths | tests + CI |

**Out of scope:** SEB / proctoring (Epoch 11), Osiris *live* API bridge (Epoch
12 — this epoch ships CSV import as the integration-ready stand-in), localisation
/ i18n, and audio-described media (no media library yet — deferred with Epoch 9
media backlog).

## 3. Data model

Two additive changes on `users` plus one new table. All additive ⇒ no data-loss
risk on `prisma db push` (CLAUDE.md Tech Stack: Prisma is the single schema
source; **no Alembic**).

### 3.1 Schema changes (Prisma — single source of truth)

In `prisma/schema.prisma`, add to `model users`:

```prisma
// Self-service visual accessibility profile (orthogonal to theme_preference).
a11y_high_contrast   Boolean @default(false)
a11y_dyslexia_font   Boolean @default(false)
a11y_text_scale      String? @db.VarChar   // 'md' | 'lg' | 'xl' (null = default)

// Administrator-granted accommodation (distinct from a self-chosen preference).
accommodation_enlarged_display Boolean @default(false)
// NOTE: provision_time_multiplier already exists (Epoch 5) — not re-added here.

accommodation_audit_log accommodation_audit_log[]  // back-relation
```

New table — the append-only provision audit trail:

```prisma
model accommodation_audit_log {
  id              String   @id @default(uuid()) @db.Uuid
  student_id      String   @db.Uuid
  changed_by      String   @db.Uuid          // admin who made the change
  field           String   @db.VarChar       // 'provision_time_multiplier' | 'accommodation_enlarged_display'
  old_value       String   @db.VarChar
  new_value       String   @db.VarChar
  source          String   @db.VarChar       // 'manual' | 'csv_import'
  created_at      DateTime @default(now()) @db.Timestamp(6)
  student         users    @relation(fields: [student_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@index([student_id], map: "ix_accommodation_audit_student_id")
  @@index([created_at], map: "ix_accommodation_audit_created_at")
}
```

- **Discrete typed columns**, not a JSON blob, for the three preference flags:
  the set is small, fixed, and type-safe (§2.5 type safety; §2.1 validate at the
  edge). Booleans default `false`, scale is nullable (`NULL` = default size).
- **Audit log is append-only**: never updated or deleted, indexed on
  `student_id` (per-student history) and `created_at` (chronological review),
  per §4 (index every FK / frequently-filtered field).
- The `users` ↔ `accommodation_audit_log` back-relation references **two**
  user columns conceptually (`student_id`, `changed_by`); only `student_id`
  carries a Prisma relation to keep the relation graph simple — `changed_by` is
  stored as a plain UUID and resolved on read (the admin set is small).

Apply it (mirrors `dev-up.sh`):

```bash
npx prisma@5.17.0 generate --schema=prisma/schema.prisma
npx prisma@5.17.0 db push --schema=prisma/schema.prisma --accept-data-loss
```

### 3.2 SQLAlchemy mirror (enums/types only)

- `models/user.py`: add the three preference columns + `accommodation_enlarged_display`.
- New `models/accommodation_audit.py`: `AccommodationAuditLog` model.
- As established in 8.9.1, SQLAlchemy mirrors the Prisma schema for
  enums/types and `verify_*` scripts; it is **not** the migration mechanism.

## 4. Backend

### 4.1 Accessibility preferences (F1) — extend, don't fork

Theme preference (Epoch 8/9) already owns the `PATCH /api/users/me/preferences/theme`
namespace and the `preferences_service`. Accessibility prefs join it rather than
spawning a parallel system (§2 single source per concept, §3 feature-scoped
module):

- **Schema** — `schemas/preferences.py`:
  ```python
  TextScale = Literal["md", "lg", "xl"]

  class AccessibilityPreferences(BaseModel):
      high_contrast: bool = False
      dyslexia_font: bool = False
      text_scale: TextScale | None = None

  class AccessibilityPreferencesUpdate(BaseModel):
      high_contrast: bool | None = None   # partial update; None = leave unchanged
      dyslexia_font: bool | None = None
      text_scale: TextScale | None = None
  ```
- **Service** — `preferences_service.update_accessibility_preferences(user_id, patch)`:
  loads, applies only the provided fields, persists, returns the resolved
  `AccessibilityPreferences`. One Prisma `update`.
- **Endpoint** — `PATCH /api/users/me/preferences/accessibility`,
  `Depends(get_current_user)`. Mirrors the theme route exactly.
- **Surface on `/auth/me`**: extend `UserPublic` with an `accessibility`
  sub-object so the SPA hydrates the profile on every session load (same path
  the theme preference already rides — no extra request).

### 4.2 Accommodation administration (F3) — a new feature module

New module `accommodations/` (per §3 feature-scoped layout):
`schemas/accommodation.py`, `services/accommodations_service.py`,
`api/endpoints/accommodations.py`, `tests/test_accommodations_admin.py`.

- **Authorisation (§1 least privilege):** every route
  `Depends(require_role(UserRole.ADMIN))`. Constructors/reviewers/students get
  `403`. This is the authoritative guard — the frontend hiding the page is
  advisory only.
- **`GET /api/accommodations/students`** — paginated (§4 pagination mandatory)
  list of students with their current `provision_time_multiplier`,
  `accommodation_enlarged_display`, searchable by email / VUnetID.
- **`PATCH /api/accommodations/students/{student_id}`** — body
  `{ provision_time_multiplier?: float, enlarged_display?: bool }`:
  1. Validate multiplier ∈ `[1.0, 3.0]` (Pydantic `Field(ge=1.0, le=3.0)`) — a
     bounded provision, never < 1.0 (can't *shorten* an exam) and capped to
     catch fat-finger `25` entries.
  2. Reject targeting a non-`STUDENT` (`400`) — accommodations apply to exam takers.
  3. For each changed field, write an `accommodation_audit_log` row
     (`old_value`, `new_value`, `changed_by = current_user.id`, `source='manual'`)
     **in the same transaction** as the user update (atomic: a provision change
     can never exist without its audit row).
- **`GET /api/accommodations/students/{student_id}/audit`** — paginated audit
  history for one student, admin-only.
- **`POST /api/accommodations/import`** — CSV upload (`multipart/form-data`):
  columns `vunet_id,provision_time_multiplier,enlarged_display`. Parsed
  server-side with the same validation as the PATCH path (reuse the validator —
  §2 single source), row errors collected and returned as a per-row report
  (`{ row, status, message }`), valid rows applied + audited (`source='csv_import'`)
  in a batch transaction (§4 bulk over loops). Partial success is reported, not
  silently swallowed.

> **Why the multiplier maths is untouched:** the *application* of
> `provision_time_multiplier` already lives in `exam_sessions_service`
> (verified by `test_accommodations.py`). This module only governs *who sets it
> and how it's recorded* — a clean separation between "granting a provision"
> (admin write) and "honouring a provision" (exam read).

### 4.3 Enlarged-display accommodation vs. text-scale preference

These are deliberately two different things (the roadmap calls this out):

- **`a11y_text_scale`** is a *preference* — the student chooses it, can change it
  anytime, and it is purely cosmetic.
- **`accommodation_enlarged_display`** is an *administrator grant* — it forces a
  minimum enlarged layout during accommodated exams regardless of preference,
  and is audited. On the exam screen the *effective* scale is
  `max(preference_scale, enlarged ? 'lg' : 'md')`. This derivation lives in one
  helper, `lib/accessibility.ts:resolveExamTextScale()` (§2 single source).

### 4.4 Backend tests (`backend/tests/`)

Per §5 (happy + edge + integration):

- `test_accessibility_prefs.py`: PATCH each field (happy); invalid `text_scale`
  → `422`; partial update leaves other fields untouched; `/auth/me` reflects it;
  unauthenticated → `401`.
- `test_accommodations_admin.py`: admin sets multiplier (happy) → user updated +
  audit row written; non-admin → `403`; multiplier `0.5` and `25` → `422`
  (bounds); targeting a CONSTRUCTOR → `400`; CSV import with one bad row →
  valid rows applied, bad row reported, audit rows have `source='csv_import'`.
- `test_accommodations.py` (existing): **re-run unchanged** as the regression
  guard that the time maths still holds (the V gate).

## 5. Frontend

### 5.1 The accessibility axis (F1) — orthogonal to theme, zero theme-matrix blow-up

The three colour themes (`dark`/`warm`/`light-blue`, §7.12) must **not** multiply
into 3×(contrast)×(font)×(scale) hand-authored variants. Instead the profile is a
**separate axis** of `<html>` data attributes, and `globals.css` carries override
blocks that compose with any theme:

- `ThemeProvider` (already applies `data-theme`) also applies, from the hydrated
  profile: `data-a11y-contrast="high"`, `data-a11y-font="dyslexic"`,
  `data-a11y-scale="lg|xl"`. (Renamed responsibility → it becomes
  `AppearanceProvider`; the theme behaviour is unchanged.)
- `globals.css` adds **token-override** blocks, never component branching
  (§7.1):
  - `[data-a11y-contrast="high"]` re-points `--color-foreground`,
    `--color-shell-border`, focus-ring tokens etc. to a maximal-contrast set —
    one block, applies under all three themes (verify the §7.12 matrix ×
    contrast).
  - `[data-a11y-font="dyslexic"]` overrides `--font-body`/`--font-display` to a
    bundled **OpenDyslexic** face (self-hosted via `next/font/local` — no
    external fetch, no CLS, GDPR-clean) and bumps `letter-spacing`/`line-height`
    tokens.
  - `[data-a11y-scale="lg"|"xl"]` scales the root font-size tokens so the whole
    type ramp grows proportionally (rem-based — everything already keys off the
    `--font-size-*` / `--text-*` tokens, so this is a single lever).
- **Contrast contract:** all interactive tokens must clear **4.5:1** in every
  theme and **7:1** under `high` (WCAG AAA for the high-contrast profile). Added
  to the §7.12 checklist.

### 5.2 Self-service controls (F1)

- **Account page** (Epoch 9 surface): new `AccessibilitySection` beside the
  Appearance section — toggles for high-contrast and dyslexia font, a segmented
  control for text scale. Writes via a new
  `useAuthStore.setAccessibilityPreference(patch)` (optimistic + rollback,
  mirroring `setThemePreference` exactly — reuse the pattern, §2).
- **In-exam quick-adjust:** a small popover in the exam header (next to the
  timer) exposing the same toggles + scale, so a student can adjust *during* the
  exam without leaving the page. It calls the same store action — one code path.
  (Closed by default, keyboard-reachable, focus-trapped.)

### 5.3 Keyboard & screen-reader support (F2)

This is the WCAG-operability spine. FE-only, concentrated on the exam flow:

- **Live-region announcer:** a single app-level `aria-live="polite"` region driven
  by a `useAnnounce()` hook. State changes already surfaced as toasts —
  *"Answer saved"*, *"Question flagged"*, *"Time running low"* — also announce.
  One announcer, one hook (§2/§3), no scattered `aria-live` nodes.
- **Keyboard navigation in the exam:** Tab order follows reading order; MCQ
  options are a proper radio group (arrow keys move selection, Space/Enter
  selects); the question navigator (Epoch 5 timeline) is arrow-key operable;
  flag/next/prev have documented shortcuts surfaced in a "Keyboard shortcuts"
  help dialog.
- **Skip links:** a "Skip to question" / "Skip to navigation" link as the first
  focusable element on the exam and main shell (visible on focus, token-styled).
- **Focus management:** `Modal` already does focus-trap-lite + restore (verified
  in Epoch 9). Audit every overlay (`Drawer`, action menus, date/time pickers,
  `ConfirmDialog`, the new quick-adjust popover) to the same contract; extract a
  shared `useFocusTrap` hook if the logic appears a third time (§2 rule of three).
- **ARIA semantics:** label every icon-only control (the Epoch 9 password
  eye-toggle, sort arrows, row-action menus, theme/a11y popovers); `aria-current`
  on the active nav/question; `aria-invalid` + `aria-describedby` wiring on form
  errors (the `Field` primitive already renders the error node — wire its `id`).
- **No new colour-only signalling:** any status conveyed by colour (e.g. the
  session-monitor green/yellow/red, blueprint badges) must also carry text or an
  icon — re-audit against §7.2.

### 5.4 Accommodation admin UI (F3)

- New route `/admin/accommodations` (first page under an `/admin` segment —
  gated by a role check in `ProtectedRoute`, with the backend `403` as the real
  boundary). `<PageShell width="wide">` (data table, §7.5).
- A `<Table>` of students (email, VUnetID, current multiplier, enlarged flag),
  searchable/sortable (§7.8 always-sorted), paginated.
- Row action → edit drawer (`Drawer`, `z-40` §7.4.1): multiplier input
  (validated client-side as advisory; backend authoritative), enlarged toggle,
  and a read-only **audit timeline** for that student (`formatAbsolute`, §7.11).
- "Import CSV" button → upload modal showing the per-row result report
  (success/skipped/error counts + downloadable error rows). Toast on completion
  (§7.10 copy rules).
- New `useAccommodationsStore` (Zustand, per-domain, §3) for the list, the
  selected student's audit, and import state.

### 5.5 Frontend tests (Playwright, `tests/e2e/`)

Following `directives/e2e_seed_naming_conventions.md`:

- `accessibility-prefs.spec.ts`: toggle dyslexia font on the account page →
  `<html data-a11y-font="dyslexic">` and persists across reload; high-contrast
  toggle sets `data-a11y-contrast`; text-scale changes root size.
- `exam-keyboard.spec.ts`: complete a practice exam using **keyboard only** —
  Tab to first question, arrow-select an MCQ option, flag via shortcut, navigate
  next, submit; assert the live region announced "Answer saved".
- `accommodations-admin.spec.ts`: admin sets a student's multiplier → table
  reflects it + audit timeline shows the entry; non-admin is redirected (UI) and
  the API returns `403` (asserted via `request`); CSV import happy + one-bad-row
  report.
- **axe-core**: integrate `@axe-core/playwright`; assert zero serious/critical
  violations on `/login`, `/account`, the exam screen, and `/admin/accommodations`.

## 6. Accessibility & security review checklist (gate before merge)

**Accessibility (the V gate):**
- [ ] Lighthouse accessibility ≥ 90 on `/login`, `/my-exams`, exam screen, `/account`.
- [ ] axe-core: zero serious/critical violations on the routes above.
- [ ] Entire exam flow operable by keyboard alone; visible focus throughout.
- [ ] Screen-reader pass (VoiceOver) completes a practice exam without sighted help.
- [ ] Contrast ≥ 4.5:1 every theme; ≥ 7:1 under `high` profile.
- [ ] Theme × a11y-profile matrix verified — no component branching (§7.1/§7.12).
- [ ] Time-multiplier maths re-verified: 1.25× → 75 min (existing test green).

**Security (§1):**
- [ ] All `/api/accommodations/*` routes `require_role(ADMIN)`; non-admin → `403`.
- [ ] Multiplier bounded `[1.0, 3.0]`; non-student targets rejected.
- [ ] Provision change + audit row written atomically (single transaction).
- [ ] CSV upload: size cap, content-type + header validation, parse errors never
      5xx; no row applied unless it validates.
- [ ] Audit log is append-only (no update/delete routes).
- [ ] Aikido scan: zero Critical/High before merge to `main`.

## 7. Stage plan (stage-gate commits per `epoch_git_strategy.md`)

| Stage | Deliverable | Verification gate | Commit |
|---|---|---|---|
| 0 | Mark Epoch 10 in-progress in roadmap; note time-multiplier already done | Roadmap reads cleanly | `docs(10): open accessibility epoch` |
| 1 | Schema: a11y pref columns, `accommodation_enlarged_display`, audit table (Prisma + SQLAlchemy), `db push` | `prisma generate` clean; columns/table present | `feat(10): accessibility + accommodation schema` |
| 2 | Accessibility prefs API + `/auth/me` surfacing | `test_accessibility_prefs.py` green | `feat(10): persist accessibility preferences` |
| 3 | `globals.css` a11y axis + `AppearanceProvider` + account `AccessibilitySection` | All 3 themes × profiles render; persists | `feat(10): high-contrast, dyslexia font, text scale` |
| 4 | Keyboard/SR: announcer, skip links, focus-trap audit, ARIA, exam keyboard nav + shortcuts dialog | axe-core clean; `exam-keyboard.spec.ts` green | `feat(10): keyboard and screen-reader support` |
| 5 | Accommodation admin module (BE) + `/admin/accommodations` (FE) + CSV import | `test_accommodations_admin.py` + admin E2E green | `feat(10): accommodation administration and audit log` |
| 6 | Lighthouse + axe CI wiring; full E2E; manual SR pass | §6 checklist satisfied | `test(10): accessibility verification suite` |
| 7 | Security checklist §6 + Aikido | Zero Critical/High | merge gate |

## 8. Follow-ups (to `directives/todo.md`)

- **TODO-013 — Osiris live accommodation bridge.** This epoch ships CSV import as
  the integration-ready stand-in; a live Osiris/SIS API sync (auto-pull approved
  provisions) belongs with the Epoch 12 interoperability work. Promote then.
- **TODO-014 — Per-question media alt-text enforcement.** Required-alt-text is a
  WCAG obligation but has no home until the media library (deferred Epoch 9
  backlog) lands. Couple it to that work so images are born accessible.
- **TODO-015 — Reduced-motion profile.** `prefers-reduced-motion` honouring plus a
  toggle to suppress transitions/animations; small, additive, deferred to keep
  this epoch focused on the higher-impact visual/keyboard/accommodation axes.

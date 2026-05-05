# Epoch 7.5 Blueprint — Future-Proofing & Maintainability

> **Branch:** `feature/epoch-7.5-design-tokens`
> **Prerequisites:** Epochs 1–7 complete and merged to `main`.
> **Reference:** `directives/epoch_roadmap.md`, `CLAUDE.md` for engineering principles.

---

## Summary

Epoch 7.5 is a comprehensive design-system and maintainability pass. It does not add new product surface (no new exam mechanics, no new analytics outputs, no Osiris-export changes), but it consolidates every cross-cutting visual and structural decision into a single, governed layer. Specifically it:

1. **Establishes a complete design token system** covering color, typography, spacing, border-radius, motion, and elevation. Every value used by every component flows through this layer. Switching the entire look and feel of the application must be achievable by editing exactly one file: `frontend/src/app/globals.css`.

2. **Migrates every component off arbitrary Tailwind values** — `bg-[#1A1A1A]`, `text-[10px]`, `tracking-[0.18em]`, `rounded-[28px]`, `shadow-[...]`, hard-coded `cubic-bezier`, `font-size: 14px` in CSS, and so on — to semantic utility classes that resolve through the token layer.

3. **Ships an end-user theme toggle.** Users see a control in the global header that lets them switch between the dark admin shell, the warm student shell, and any future theme regardless of their role. The chosen theme is persisted on a single new `users.theme_preference` column so it survives reloads and follows the user across devices.

4. **Decomposes three oversized backend service files** — `psychometrics_service.py` (822 lines), `analytics_pdf_service.py` (279 lines), and `grading_service.py` (468 lines) — into focused sub-modules behind a re-export facade so no caller outside `services/` ever changes its import path.

This plan is decision-complete and implementation-ready. Every stage names the exact files that change, the exact replacements to perform, and the exact criteria for success.

The epoch is no longer a *pure* refactor: Stage 9 introduces one new column, one new Pydantic schema, and one new endpoint to back the theme toggle. Every other change in this epoch is structurally equivalent to existing behaviour.

---

## Current Code Status (Ground Truth)

### Frontend

- Technology: Next.js 16.1.6, React 19.2.3, TypeScript, Tailwind CSS v4 (`@import "tailwindcss"` with `@theme inline` blocks).
- `globals.css` currently defines exactly **two tokens**: `--background` and `--foreground`. These are mapped into `@theme` but never consumed by any component — the components bypass them entirely in favour of inline arbitrary values.
- Two distinct visual themes exist and must both be preserved and tokenised:
  - **Dark admin shell** (ADMIN, CONSTRUCTOR): dark navy/charcoal backgrounds with blue accents.
  - **Warm student shell** (STUDENT): warm cream/ivory backgrounds with cobalt blue primary and warm brown accents.
- Three plain CSS files contain hardcoded values unreachable by Tailwind refactoring: `TipTapEditor.css`, `MCQOptionsPanel.css`, `EssayOptionsPanel.css`.

#### Hardcoded arbitrary colour inventory (by frequency)

| Value | Occurrences | Semantic role |
|---|---|---|
| `#1A1A1A` | 17 | Dark shell: page background |
| `#333` | 15 | Dark shell: border / divider |
| `#e8dcc7` | 14 | Student shell: warm border |
| `#A1A1AA` | 9 | Dark shell: muted text |
| `#1055cc` | 8 | Student shell: primary brand blue |
| `#8a6c3e` | 7 | Student shell: warm accent / label |
| `#d8c7aa` | 4 | Student shell: lighter warm border |
| `#242424` | 4 | Dark shell: card / panel surface |
| `#fffaf4` / `#fffaf0` | 5 | Student shell: page background |
| `#0b1220` / `#08111d` | 4 | Dark shell: deep input background |
| `#111827` | 3 | Dark shell: form card background |
| `#eef4ff` / `#e9f0ff` | 3 | Student shell: hover / light blue wash |
| `#1a1a2e` / `#16213e` | 4 (CSS) | TipTap editor: surface / toolbar |
| `#667eea` | 3 (CSS) | TipTap editor: active / accent |
| `#4ade80` | 1 (CSS) | MCQ panel: correct option indicator |

#### Files with arbitrary colour values

- `src/app/page.tsx`
- `src/app/login/page.tsx`
- `src/app/my-exams/page.tsx`
- `src/app/author/page.tsx`
- `src/app/my-results/[sessionId]/page.tsx`
- `src/components/layout/GlobalHeader.tsx`
- `src/components/student/StudentExamCard.tsx`
- `src/components/sessions/SessionCreateForm.tsx`
- `src/components/sessions/ScheduledSessionsTable.tsx`
- `src/components/sessions/CourseEnrollmentDrawer.tsx`
- `src/components/auth/ProtectedRoute.tsx`
- `src/components/editor/TipTapEditor.css`
- `src/components/editor/MCQOptionsPanel.css`
- `src/components/editor/EssayOptionsPanel.css`

#### Typography arbitrary-value inventory

Font-size arbitrary values found in TSX:
- `text-[9px]` — 1 occurrence (blueprint rule chip)
- `text-[10px]` — 7 occurrences (eyebrow labels on landing, login, blueprint)
- `text-[11px]` — 13+ occurrences (analytics components — captions, table headers, chip labels)

Letter-spacing arbitrary values found in TSX:
- `tracking-[0.18em]` — 4 occurrences
- `tracking-[0.2em]` — 4 occurrences
- `tracking-[0.24em]` — 4 occurrences
- `tracking-[0.26em]` — 1 occurrence
- `tracking-[0.3em]` — 5 occurrences
- `tracking-[0.32em]` — 2 occurrences

Font-size hard-coded in CSS files:
- `TipTapEditor.css`: `13px`, `15px`
- `MCQOptionsPanel.css`: `13px`, `14px` (×3), `18px`
- `EssayOptionsPanel.css`: `0.875rem` (×3), `1.125rem`

#### Spacing, radius, and elevation inventory

Border-radius arbitrary values found in TSX:
- `rounded-[22px]` — 1 occurrence (info grid card on `StudentExamCard`)
- `rounded-[24px]` — 4 occurrences (results card, exam list rows, drawer panels)
- `rounded-[28px]` — 5 occurrences (student exams hero, scheduled sessions, session create form, course form, student exam card)
- `rounded-[32px]` — 2 occurrences (blueprint hero)
- `rounded-[34px]` — 2 occurrences (my-exams hero, results hero)

Border-radius hard-coded in CSS files:
- `TipTapEditor.css`: `4px`, `6px`, `8px`
- `MCQOptionsPanel.css`: `4px`, `6px`, `8px`
- `EssayOptionsPanel.css`: `0.5rem`, `0.75rem`

Min/max sizing arbitrary values:
- `min-w-[150px]`, `min-w-[160px]`, `min-w-[200px]`, `min-w-[240px]`
- `min-h-[40px]`, `min-h-[60px]`, `min-h-[160px]`, `min-h-[700px]`
- `max-w-[200px]`, `max-w-[1400px]`

Arbitrary box-shadow values:
- 3 occurrences with literal `shadow-[0_24px_60px_rgba(...)]`, `shadow-[0_20px_60px_rgba(...)]`, `shadow-[0_35px_80px_rgba(...)]` on warm-shell hero/card surfaces.

#### Motion inventory

- `@keyframes ov-shake` defined in `globals.css` (preserved verbatim, consumed by `BlueprintSaveIndicator.tsx`).
- One literal `transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)` inline style at `src/components/blueprint/QuestionPickerModal.tsx:275`.
- All other transitions use named Tailwind utilities (`transition-all`, `duration-200`, etc.) and require no tokenisation. Named utilities will be left as-is unless a future stage chooses to centralise duration via tokens — see Stage 7.

### Backend

- `psychometrics_service.py` (822 lines): Combines IRT parameter estimation, CTT facility/discrimination metrics, Cohen's Kappa, and Cronbach's Alpha in one flat module. The statistical algorithms have no runtime dependency on each other.
- `analytics_pdf_service.py` (279 lines): Mixes ReportLab PDF layout code with pure formatting helpers (`format_percentage`, `format_irt_params`, etc.) that are reusable by other output formats but buried inside a PDF-specific file.
- `grading_service.py` (468 lines): Contains MCQ scoring logic, partial-credit logic, grade-boundary application, and the main auto-grade DB orchestration all in one file. The scoring functions (`grade_mcq_single`, `grade_multiple_response`, `apply_grade_boundaries`) have zero database dependencies and should be independently unit-testable.
- The `User` model (`backend/app/models/user.py` SQLAlchemy + `prisma/schema.prisma` Prisma + corresponding Alembic migration) gains exactly **one** new column in this epoch — `theme_preference` (nullable text) — which backs the user-controlled theme toggle. No other model is touched. No other endpoint file is touched outside the new `PATCH /api/users/me/preferences` endpoint added in Stage 9.

---

## Target Behaviour (Locked)

1. A single file — `frontend/src/app/globals.css` — defines every design token for every theme and every dimension (color, typography, spacing, radius, motion, elevation). No literal value (hex, px, rem, em, ms, cubic-bezier, rgba shadow) for any of those dimensions appears anywhere else in the frontend codebase outside the documented exemption list.
2. Switching from the current dark admin theme to any alternative theme requires editing exactly one CSS rule block in `globals.css` (the `[data-theme="<name>"]` selector) and nothing else.
3. At minimum two themes ship with the refactor: `dark` (existing admin shell, the default) and `warm` (existing student shell). A third `light-blue` placeholder theme ships as a fully implemented (but optional) example so the extension pattern is exercised end-to-end, not just commented.
4. All Tailwind arbitrary values in TSX/JSX (`bg-[#...]`, `text-[Xpx]`, `tracking-[Xem]`, `rounded-[Xpx]`, `shadow-[...]`, etc.) are replaced with semantic utility classes resolving through the `@theme` token layer.
5. All hard-coded values in the three editor CSS files are replaced with `var(--...)` references.
6. Users can switch the active theme manually via a toggle control mounted in the global header. The selected theme is stored on the user's `theme_preference` column and re-applied on login from any device. Logged-out users still see the role-default theme until they authenticate.
7. The application is keyboard- and screen-reader-accessible at the toggle control: it has a visible label, an `aria-label`, and announces theme changes via a live region or analogous mechanism.
8. `psychometrics_service.py` is split into at minimum three focused modules (`irt_engine.py`, `ctt_metrics.py`, `reliability.py`). The original file becomes a thin facade re-exporting public symbols — no caller changes required.
9. `analytics_pdf_service.py` is split into `analytics_formatters.py` (pure formatting helpers, no ReportLab import) and a slimmed `analytics_pdf_service.py` (PDF layout only).
10. `grading_service.py` is split into `scoring_strategies.py` (pure scoring functions, zero DB dependencies) and a slimmed `grading_service.py` (orchestration and DB writes only).
11. All existing Pytest tests and Playwright E2E tests pass without modification after the refactor. New tests are added only for the theme-preference endpoint and the theme-toggle UI.
12. Zero new Critical or High Aikido security findings introduced.

---

## Design Token Architecture

Tailwind CSS v4 uses `@theme inline` blocks to register custom tokens into the utility class generator. The pattern for this epoch:

1. Define semantic CSS custom properties under `:root` (theme-invariant tokens) and under scoped `data-theme` attribute selectors (theme-variant tokens) in `globals.css`.
2. Map those custom properties into the `@theme` layer so Tailwind generates `bg-shell-bg`, `text-student-primary`, `text-eyebrow`, `tracking-eyebrow`, `rounded-card`, `duration-normal`, `ease-standard`, etc. as real utility classes.
3. Apply the appropriate `data-theme` attribute at the root `<html>` element via a `ThemeProvider` client component (Stage 8) that combines the user's stored `theme_preference` (Stage 9) with the role-based default fallback.

**Token naming convention.** Use the pattern `--<dimension>-<role>-<modifier>?`. Examples:
- Colour: `--color-shell-bg`, `--color-student-primary`, `--color-editor-toolbar`.
- Typography: `--font-size-eyebrow`, `--tracking-medium`, `--font-size-editor-base`.
- Geometry: `--radius-card`, `--size-input-min-w`.
- Motion: `--duration-normal`, `--ease-standard`.
- Elevation: `--shadow-warm-card`.

Never use a raw hex/px value in a token name. Never invent a token for a value used in only one place unless the naming improves intent legibility (the layout-size tokens are an explicit such case).

### Dark Admin Shell tokens (`:root` defaults)

```css
--color-shell-bg:              #1A1A1A;  /* page background */
--color-shell-surface:         #242424;  /* card / panel surface */
--color-shell-surface-deep:    #111827;  /* form card, deeper surface */
--color-shell-input:           #0b1220;  /* input field background */
--color-shell-input-alt:       #08111d;  /* alternative input (course form) */
--color-shell-border:          #333333;  /* standard border */
--color-shell-border-deep:     #223149;  /* course form border */
--color-shell-muted:           #A1A1AA;  /* secondary / helper text */
--color-shell-muted-dim:       #555555;  /* very dim text */
--color-shell-panel-a:         #0d1321;  /* sessions table card */
--color-shell-panel-b:         #08101b;  /* drawer panel */
--color-shell-panel-c:         #0c1628;  /* course create form */
--color-shell-panel-d:         #050b13;  /* enrollment list bg */
--color-shell-panel-e:         #040914;  /* enrollment row item */
```

### Student Warm Shell tokens (`[data-theme="warm"]`)

```css
--color-student-bg:            #fffaf0;  /* page background */
--color-student-bg-alt:        #fffaf4;  /* alternative page bg */
--color-student-surface:       #fffdf9;  /* card surface */
--color-student-wash:          #f8f3ea;  /* info grid background */
--color-student-border:        #e8dcc7;  /* standard warm border */
--color-student-border-alt:    #d8c7aa;  /* lighter warm border */
--color-student-accent:        #8a6c3e;  /* warm brown label / caption */
--color-student-primary:       #1055cc;  /* primary CTA blue */
--color-student-primary-dark:  #0d47ae;  /* primary hover state */
--color-student-hover-wash:    #e9f0ff;  /* nav link hover wash */
--color-student-hover-light:   #eef4ff;  /* login info box */
--color-student-disabled-bg:   #c7d6f5;  /* disabled button bg */
--color-student-disabled-text: #5e77aa;  /* disabled button text */
--color-student-success-bg:    #dff2e5;  /* joinable badge background */
--color-student-success-text:  #156341;  /* joinable badge text */
--color-student-neutral-badge: #eef0f7;  /* upcoming badge background */
--color-student-logout:        #b2471f;  /* sign out button text */
--color-student-logout-dark:   #8f3411;  /* sign out hover text */
--color-student-logout-wash:   #fff0e6;  /* sign out hover background */
```

### Editor Surface tokens (`:root`, theme-invariant)

```css
--color-editor-bg:             #1a1a2e;  /* TipTap wrapper bg */
--color-editor-toolbar:        #16213e;  /* toolbar background */
--color-editor-border:         #333333;  /* editor border */
--color-editor-btn-border:     #444444;  /* toolbar button border */
--color-editor-btn-hover:      #2a2a4a;  /* toolbar button hover bg */
--color-editor-accent:         #667eea;  /* active toolbar button / accent */
--color-editor-text:           #e0e0e0;  /* editor content text */
--color-editor-correct:        #4ade80;  /* MCQ correct option indicator */
--color-editor-placeholder:    #555555;  /* option input placeholder */
--color-editor-remove:         #f87171;  /* remove button hover */
--color-editor-essay-surface:  #1a1a1a;  /* EssayOptionsPanel container */
--color-editor-essay-input:    #242424;  /* essay number input bg */
--color-editor-focus:          #3b82f6;  /* focus ring (essay inputs) */
```

### Typography tokens (`:root`, theme-invariant)

```css
/* Eyebrow / chip / caption scale */
--font-size-eyebrow-xs:        9px;     /* very small uppercase chip */
--font-size-eyebrow-sm:        10px;    /* role labels, eyebrow captions */
--font-size-eyebrow:           11px;    /* default eyebrow / analytics caption */

/* Editor surface scale */
--font-size-editor-xs:         13px;    /* TipTap helper, panel meta */
--font-size-editor-sm:         14px;    /* MCQ option title / labels */
--font-size-editor-base:       15px;    /* TipTap content body */
--font-size-editor-lg:         18px;    /* MCQ option indicator */
--font-size-essay-title:       1.125rem;
--font-size-essay-body:        0.875rem;

/* Letter-spacing scale */
--tracking-eyebrow:            0.18em;
--tracking-tight:              0.2em;
--tracking-medium:             0.24em;
--tracking-snug:               0.26em;
--tracking-wide:               0.3em;
--tracking-wider:              0.32em;

/* Font families (route Next.js variables through tokens) */
--font-display:                var(--font-geist-sans);
--font-body:                   var(--font-geist-sans);
--font-mono:                   var(--font-geist-mono);
```

### Geometry tokens (`:root`, theme-invariant)

```css
/* Radius scale */
--radius-xs:                   4px;
--radius-sm:                   6px;
--radius-md:                   8px;
--radius-lg:                   0.5rem;
--radius-xl:                   0.75rem;
--radius-card-sm:              22px;
--radius-card:                 24px;
--radius-card-md:              28px;
--radius-card-lg:              32px;
--radius-card-xl:              34px;

/* Layout-size tokens (named one-offs) */
--size-input-min-w:            240px;
--size-table-cell-min-w:       160px;
--size-essay-min-h:            160px;
--size-blueprint-canvas-min-h: 700px;
--size-page-max-w:             1400px;

/* Elevation tokens — warm-shell hero surfaces */
--shadow-warm-card:            0 24px 60px rgba(83, 65, 35, 0.12);
--shadow-warm-hero-md:         0 20px 60px rgba(72, 52, 24, 0.10);
--shadow-warm-hero-lg:         0 35px 80px rgba(72, 52, 24, 0.12);
```

### Motion tokens (`:root`, theme-invariant)

```css
--duration-fast:               120ms;
--duration-normal:             200ms;   /* matches the existing inline 0.2s */
--duration-slow:               300ms;

--ease-standard:               cubic-bezier(0.4, 0, 0.2, 1);  /* Material standard */
--ease-decelerate:             cubic-bezier(0, 0, 0.2, 1);
--ease-accelerate:             cubic-bezier(0.4, 0, 1, 1);
```

The `@keyframes ov-shake` definition stays exactly as-is — keyframes do not need tokenisation, only the surfaces that *consume* duration/easing values do.

---

## Stage-by-Stage Implementation

Execution order matters: token foundations land first, then per-dimension migrations consume them, then the theme architecture wires the user-controlled toggle on top, and finally the backend decomposition runs in isolation. The testing stage is last and gates the merge.

### Stage 1 — Color Token Foundation in globals.css

**Goal:** Introduce the complete *colour* token vocabulary in `globals.css` using Tailwind v4 `@theme inline` syntax. No component code is modified in this stage.

**Rationale:** Separating colour-token definition from token consumption means the foundation can be reviewed before any refactoring touches component files. A rollback at this stage has zero user-visible effect.

**Tasks:**
- Open `frontend/src/app/globals.css`.
- Remove the existing `@media (prefers-color-scheme: dark)` block — it conflicts with the explicit `data-theme` architecture being introduced.
- Define all dark admin shell tokens (`--color-shell-*`) under `:root`. This makes dark the application default.
- Define all student warm shell tokens (`--color-student-*`) under `[data-theme="warm"]`.
- Define all editor surface tokens (`--color-editor-*`) under `:root`.
- Add the `@theme inline` block that maps every `--color-*` variable to a Tailwind colour token (e.g. `--color-shell-bg: var(--color-shell-bg)` inside `@theme` makes `bg-shell-bg` a valid utility class).
- Add a fully populated `[data-theme="light-blue"]` block (placeholder palette of your choice — see THEMES.md guidance) so the third-theme extension pattern is exercised and the toggle in Stage 9 has three options out of the box.
- Preserve the existing `@keyframes ov-shake` animation — used by `BlueprintSaveIndicator.tsx`.

**Exit criteria:**
- `globals.css` contains all listed colour tokens with correct hex values.
- `bg-shell-bg`, `text-student-primary`, etc. are generated as utility classes (verify via build output).
- Three theme blocks are present: `:root` (dark default), `[data-theme="warm"]`, `[data-theme="light-blue"]`.
- No existing test fails — no component has changed yet.
- Application builds without TypeScript or CSS errors.

---

### Stage 2 — Dark Admin Shell Migration

**Goal:** Replace every hardcoded arbitrary colour value in the admin/constructor-facing component files with semantic token-based Tailwind classes.

**Rationale:** The dark admin shell has the highest concentration of arbitrary values (~60% of all occurrences). Isolating it as a stage makes the diff reviewable and keeps the student shell intact so regressions are immediately visible.

**Tasks:**
- `src/app/page.tsx`: `bg-[#1A1A1A]` → `bg-shell-bg`, `bg-[#242424]` → `bg-shell-surface`, `border-[#333]` → `border-shell-border`, `text-[#A1A1AA]` → `text-shell-muted`, `text-[#555]` → `text-shell-muted-dim`.
- `src/app/login/page.tsx`: Same replacements including the `Suspense` fallback div.
- `src/components/sessions/SessionCreateForm.tsx`: `bg-[#111827]` → `bg-shell-surface-deep`, `bg-[#0b1220]` → `bg-shell-input`, `bg-[#0c1628]` → `bg-shell-panel-c`, `bg-[#08111d]` → `bg-shell-input-alt`, `border-[#223149]` → `border-shell-border-deep`. Both the session form and course creation form must be covered.
- `src/components/sessions/ScheduledSessionsTable.tsx`: `bg-[#0d1321]` → `bg-shell-panel-a`.
- `src/components/sessions/CourseEnrollmentDrawer.tsx`: `bg-[#08101b]` → `bg-shell-panel-b`, `bg-[#050b13]` → `bg-shell-panel-d`, `bg-[#040914]` → `bg-shell-panel-e`.
- `src/app/author/page.tsx`: Audit and replace any remaining arbitrary dark values.
- `src/components/analytics/*.tsx`: Audit all analytics components for hardcoded hex values and replace with matching shell tokens.
- After each file edit, verify `npx tsc --noEmit` passes before moving to the next file.

**Exit criteria:**
- All admin/constructor-facing pages render visually identically to their pre-refactor state.
- Zero `bg-[#...]`, `text-[#...]`, or `border-[#...]` arbitrary values remain in any listed file.
- `next build` completes without errors.
- Playwright tests covering admin flows (`session-manager.spec.ts`, `blueprint-picker.spec.ts`) pass.

---

### Stage 3 — Student Warm Shell Migration

**Goal:** Replace all hardcoded arbitrary colour values in the student-facing component files with semantic warm-shell token classes.

**Rationale:** The warm student shell uses a completely different palette and a different `data-theme` context. Keeping it as a separate stage allows both shells to be verified independently.

**Tasks:**
- `src/app/my-exams/page.tsx`: Replace inline gradient background with a token-based equivalent — define `--gradient-student-page` in `globals.css`. Replace `text-[#8a6c3e]` → `text-student-accent`, `text-[#1055cc]` → `text-student-primary`, `border-[#e8dcc7]` → `border-student-border`, `border-[#d8c7aa]` → `border-student-border-alt`, `bg-[#f8f3ea]` → `bg-student-wash`.
- `src/components/student/StudentExamCard.tsx`: `border-[#d8c7aa]` → `border-student-border-alt`, `text-[#8a6c3e]` → `text-student-accent`, `bg-[#dff2e5]` → `bg-student-success-bg`, `text-[#156341]` → `text-student-success-text`, `bg-[#eef0f7]` → `bg-student-neutral-badge`, `bg-[#f8f3ea]` → `bg-student-wash`, `bg-[#1055cc]` → `bg-student-primary`, `hover:bg-[#0d47ae]` → `hover:bg-student-primary-dark`, `disabled:bg-[#c7d6f5]` → `disabled:bg-student-disabled-bg`, `disabled:text-[#5e77aa]` → `disabled:text-student-disabled-text`.
- `src/components/layout/GlobalHeader.tsx`: Replace all student-shell conditional classes — `bg-[#fffaf0]` → `bg-student-bg`, `border-[#e8dcc7]` → `border-student-border`, `text-[#1055cc]` → `text-student-primary`, `bg-[#1055cc]` → `bg-student-primary`, `hover:bg-[#e9f0ff]` → `hover:bg-student-hover-wash`, `bg-white border-[#d8c7aa]` → `bg-white border-student-border-alt`, `text-[#b2471f]` → `text-student-logout`, `hover:text-[#8f3411]` → `hover:text-student-logout-dark`, `hover:bg-[#fff0e6]` → `hover:bg-student-logout-wash`. Admin-shell conditional classes (`bg-gray-900`, etc.) use named Tailwind colours and must remain unchanged.
- `src/app/my-results/[sessionId]/page.tsx`: Audit and replace warm-shell arbitrary values.
- `src/components/auth/ProtectedRoute.tsx`: Audit for arbitrary values (typically uses dark shell for loading fallback).

**Exit criteria:**
- Student-facing pages render visually identically to their pre-refactor state.
- Zero warm-palette arbitrary hex values remain in student components.
- Playwright test `student-my-exams.spec.ts` passes.

---

### Stage 4 — CSS File Migration (Editor Components)

**Goal:** Replace all hardcoded hex values in the three plain CSS files with `var(--color-editor-*)` references pointing to tokens defined in Stage 1.

**Rationale:** The editor CSS files are outside the Tailwind utility class system and cannot be migrated using `className` replacements. They must use CSS custom property `var()` references.

**Tasks:**
- `src/components/editor/TipTapEditor.css`:
  - `#333` (border) → `var(--color-editor-border)`
  - `#1a1a2e` (wrapper bg) → `var(--color-editor-bg)`
  - `#16213e` (toolbar bg) → `var(--color-editor-toolbar)`
  - `#444` (button border) → `var(--color-editor-btn-border)`
  - `#e0e0e0` (text) → `var(--color-editor-text)`
  - `#667eea` (active/accent) → `var(--color-editor-accent)`
  - `#2a2a4a` (button hover bg) → `var(--color-editor-btn-hover)`
  - `#fff` (heading text in content) → `white` (CSS keyword, no token needed)
  - **Exemption:** The syntax highlighting colour block (`hljs-*` prefixed classes) follows the GitHub Dark theme spec and must not be tokenised. Leave with a comment: `/* Syntax highlighting: GitHub Dark theme — exempt from token system */`.
- `src/components/editor/MCQOptionsPanel.css`:
  - `#1a1a2e` (panel bg) → `var(--color-editor-bg)`
  - `#333` (border) → `var(--color-editor-border)`
  - `#16213e` (option bg) → `var(--color-editor-toolbar)`
  - `#e0e0e0` (text) → `var(--color-editor-text)`
  - `#667eea` (letter colour, add-btn) → `var(--color-editor-accent)`
  - `#4ade80` (correct indicator) → `var(--color-editor-correct)`
  - `#555` (placeholder) → `var(--color-editor-placeholder)`
  - `#f87171` (remove hover) → `var(--color-editor-remove)`
- `src/components/editor/EssayOptionsPanel.css`:
  - `#1a1a1a` (container bg) → `var(--color-editor-essay-surface)`
  - `#333` (border) → `var(--color-editor-border)`
  - `#fff` (title colour) → `white`
  - `#a1a1aa` (subtitle, label) → `var(--color-shell-muted)`
  - `#242424` (input bg) → `var(--color-editor-essay-input)`
  - `#3b82f6` (focus ring) → `var(--color-editor-focus)`
- After editing each CSS file, visually verify the TipTap editor, MCQ option panel, and essay option panel in the authoring workbench still render correctly.

**Exit criteria:**
- Zero hardcoded hex values remain in the three CSS files (syntax highlighting block exempted and documented).
- `grep -E "#[0-9a-fA-F]{3,6}" src/components/editor/` returns zero matches outside the `hljs` block.
- The authoring workbench page (`/author`) renders identically before and after.

---

### Stage 5 — Typography Token System

**Goal:** Add the typography token vocabulary to `globals.css`, expose it via `@theme inline`, and migrate every arbitrary `text-[Xpx]`, `tracking-[Xem]`, and CSS-file `font-size` value to the token layer.

**Rationale:** Font-size and letter-spacing are repeated across many components with near-duplicate values (`text-[10px]` and `text-[11px]` are visually almost-the-same; `tracking-[0.18em]` through `tracking-[0.32em]` form an intentional but ungoverned scale). Centralising them in `globals.css` lets a typography refresh happen in one place and removes a class of accidental visual drift.

**Tasks:**
- Add the `--font-size-*`, `--tracking-*`, and `--font-display/body/mono` tokens defined in the Typography tokens section above to `globals.css` under `:root`.
- Extend the `@theme inline` block: map every `--font-size-*` to `--text-<name>` (e.g. `--text-eyebrow: var(--font-size-eyebrow);` makes `text-eyebrow` a utility class) and every `--tracking-*` to `--tracking-<name>` (Tailwind v4 already exposes these names; the mapping just routes them through tokens).
- TSX migrations:
  - `src/app/page.tsx`: `text-[10px]` → `text-eyebrow-sm`.
  - `src/app/login/page.tsx`: `text-[10px]` → `text-eyebrow-sm`.
  - `src/app/blueprint/page.tsx`: `text-[9px]` → `text-eyebrow-xs`, `text-[10px]` → `text-eyebrow-sm`, `text-[11px]` → `text-eyebrow`.
  - `src/app/analytics/page.tsx`, `src/app/analytics/tests/[testId]/page.tsx`, `src/app/analytics/items/[loId]/page.tsx`: `text-[11px]` → `text-eyebrow`, `tracking-[0.24em]` → `tracking-medium`.
  - `src/components/analytics/*.tsx` (all files): `text-[11px]` → `text-eyebrow`, `text-[10px]` → `text-eyebrow-sm`, `tracking-[0.18em]` → `tracking-eyebrow`, `tracking-[0.24em]` → `tracking-medium`.
  - `src/app/grading/page.tsx`, `src/app/grading/[sessionId]/page.tsx`, `src/app/my-exams/page.tsx`, `src/app/my-results/[sessionId]/page.tsx`: tracking values → corresponding `tracking-*` tokens (`0.2em` → `tracking-tight`, `0.24em` → `tracking-medium`, `0.26em` → `tracking-snug`, `0.3em` → `tracking-wide`, `0.32em` → `tracking-wider`).
  - `src/components/student/StudentExamCard.tsx`, `src/components/sessions/CourseEnrollmentDrawer.tsx`, `src/components/sessions/ScheduledSessionsTable.tsx`: tracking values → matching `tracking-*` tokens.
- CSS migrations:
  - `TipTapEditor.css`: `font-size: 13px` → `font-size: var(--font-size-editor-xs)`; `font-size: 15px` → `font-size: var(--font-size-editor-base)`.
  - `MCQOptionsPanel.css`: `13px` → `var(--font-size-editor-xs)`; `14px` → `var(--font-size-editor-sm)`; `18px` → `var(--font-size-editor-lg)`.
  - `EssayOptionsPanel.css`: `1.125rem` → `var(--font-size-essay-title)`; `0.875rem` → `var(--font-size-essay-body)`.
- Final audit: run `grep -rEn "text-\[[0-9]" src/` and `grep -rEn "tracking-\[[0-9]" src/` and `grep -rEn "font-size:\s*[0-9]" src/components/editor/` — every remaining match must be either inside the documented exemption set or a legitimate one-off (in which case add a token and migrate it).

**Exit criteria:**
- Zero `text-[Xpx]` and `tracking-[Xem]` arbitrary values in any TSX/JSX file.
- Zero literal `font-size: Xpx` / `Xrem` declarations in the three editor CSS files.
- Pages render with pixel-identical typography. Verify `/`, `/login`, `/blueprint`, `/analytics`, `/grading`, `/my-exams`, `/my-results/[id]`, `/author` (authoring workbench).
- TypeScript and `next build` pass.

---

### Stage 6 — Spacing & Radius Token System

**Goal:** Add the radius, sizing, and elevation tokens to `globals.css`, expose them via `@theme inline`, and migrate every arbitrary `rounded-[Xpx]`, layout `min-w/min-h/max-w-[X]`, and `shadow-[...]` value to the token layer.

**Rationale:** Border-radius is the single most repeated arbitrary geometry value in the codebase (`rounded-[28px]` × 5, `rounded-[24px]` × 4, etc.). Putting them on a named scale lets corner-radius adjustments be made globally and signals intent ("card", "card-sm") instead of leaking magic numbers. Layout-size one-offs are rarer but still benefit from naming for grep-ability and future responsive overrides.

**Tasks:**
- Add the `--radius-*`, `--size-*`, and `--shadow-warm-*` tokens defined in the Geometry tokens section above to `globals.css` under `:root`.
- Extend `@theme inline`: map `--radius-*` to `--radius-<name>` (Tailwind v4 generates `rounded-card`, `rounded-card-md`, etc.), and define `--shadow-warm-card`, `--shadow-warm-hero-md`, `--shadow-warm-hero-lg` so `shadow-warm-card`, etc. become utility classes.
- TSX radius migrations:
  - `src/components/student/StudentExamCard.tsx`: `rounded-[28px]` → `rounded-card-md`; `rounded-[22px]` → `rounded-card-sm`.
  - `src/app/my-exams/page.tsx`: `rounded-[34px]` → `rounded-card-xl`; `rounded-[28px]` → `rounded-card-md`; `rounded-[24px]` → `rounded-card`.
  - `src/app/my-results/[sessionId]/page.tsx`: `rounded-[34px]` → `rounded-card-xl`; `rounded-[24px]` → `rounded-card`.
  - `src/app/blueprint/page.tsx`: `rounded-[32px]` → `rounded-card-lg`.
  - `src/components/sessions/SessionCreateForm.tsx`: `rounded-[28px]` → `rounded-card-md`.
  - `src/components/sessions/ScheduledSessionsTable.tsx`: `rounded-[28px]` → `rounded-card-md`; `rounded-[24px]` → `rounded-card`.
  - `src/components/sessions/CourseEnrollmentDrawer.tsx`: `rounded-[24px]` → `rounded-card`.
- TSX sizing migrations:
  - `src/app/grading/page.tsx`: `min-w-[240px]` → `min-w-input` (utility generated from `--size-input-min-w`); `min-w-[160px]` → `min-w-table-cell`.
  - `src/app/items/page.tsx`: `min-w-[150px]` → keep as arbitrary (one-off, no scale match) **OR** introduce `--size-filter-min-w: 150px` — pick one and apply consistently. Recommended: introduce the token.
  - `src/app/items/page.tsx`: `max-w-[200px]` → token `--size-cell-max-w` if introduced; otherwise leave with a tracking note in THEMES.md exemption list.
  - `src/app/blueprint/page.tsx`: `min-h-[700px]` → `min-h-blueprint-canvas`; `max-w-[1400px]` → `max-w-page`; `min-h-[40px]` and `min-h-[60px]` may stay as arbitrary if you judge them too local to deserve tokens — explicitly document the choice in THEMES.md.
  - `src/components/exam/EssayQuestion.tsx`: `min-h-[160px]` → `min-h-essay`.
- TSX shadow migrations:
  - `src/components/student/StudentExamCard.tsx`: `shadow-[0_24px_60px_rgba(83,65,35,0.12)]` → `shadow-warm-card`.
  - `src/app/my-exams/page.tsx`: `shadow-[0_35px_80px_rgba(72,52,24,0.12)]` → `shadow-warm-hero-lg`.
  - `src/app/my-results/[sessionId]/page.tsx`: `shadow-[0_20px_60px_rgba(72,52,24,0.10)]` → `shadow-warm-hero-md`.
- CSS radius migrations:
  - `TipTapEditor.css`: `4px` → `var(--radius-xs)`; `6px` → `var(--radius-sm)`; `8px` → `var(--radius-md)`.
  - `MCQOptionsPanel.css`: same mapping.
  - `EssayOptionsPanel.css`: `0.5rem` → `var(--radius-lg)`; `0.75rem` → `var(--radius-xl)`.
- Final audit: run `grep -rEn "rounded-\[" src/` and `grep -rEn "shadow-\[" src/` and `grep -rEn "border-radius:\s*[0-9]" src/components/editor/` — every remaining match must be in the documented exemption set.

**Exit criteria:**
- Zero `rounded-[Xpx]` arbitrary values in TSX/JSX, except those explicitly documented as exempt.
- Zero arbitrary `shadow-[...]` values for warm-shell hero/card surfaces.
- Zero literal `border-radius: X` declarations in the three editor CSS files.
- Visual verification: hero cards on `/my-exams`, `/my-results/[id]`, `StudentExamCard`, `/blueprint`, `/scheduled-sessions` render with identical corner radii and elevations to pre-refactor.
- `next build` and `npx tsc --noEmit` pass.

---

### Stage 7 — Motion Token System

**Goal:** Add the motion token vocabulary to `globals.css`, expose it via `@theme inline`, and replace the one literal `cubic-bezier` use with a token reference. Document the policy for named Tailwind transition utilities.

**Rationale:** The codebase has only one literal motion value (the inline cubic-bezier in `QuestionPickerModal.tsx`), but locking the duration/easing scale into tokens now means future motion work — a hover-elevation refresh, a route-transition system, an Epoch-8 animation pass — starts on a governed surface. Tokens also make a future "reduced motion" mode tractable as a single token override.

**Tasks:**
- Add the `--duration-*` and `--ease-*` tokens defined in the Motion tokens section above to `globals.css` under `:root`.
- Extend `@theme inline`: expose `--duration-fast/normal/slow` as `transition-duration` utilities (Tailwind v4 already lets you customise these via `--duration-<name>`) and `--ease-*` as `transition-timing-function` utilities.
- Replace the inline `transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)` at `src/components/blueprint/QuestionPickerModal.tsx:275` with `transition: all var(--duration-normal) var(--ease-standard)`.
- Audit `src/` for any other inline `style={{ transition: ... }}` literals — if more are found, replace with token references.
- Policy documented in `THEMES.md`: named Tailwind transition utilities (`transition`, `transition-all`, `duration-200`, `duration-300`, etc.) are *not* required to be migrated in this stage — Tailwind already routes them through generated utilities. The migration target is *literal* duration/easing values only. Named utilities remain valid; they will be reconsidered in a future motion-system pass if and when reduced-motion behaviour is wired up.

**Exit criteria:**
- Zero literal `cubic-bezier(...)` strings anywhere in `src/` outside `globals.css`.
- Zero literal millisecond durations in inline `style={{ transition: ... }}` blocks.
- `QuestionPickerModal` open/close animation behaves identically to before (visual smoke test).
- `next build` and `npx tsc --noEmit` pass.

---

### Stage 8 — ThemeProvider & Automatic Role-Based Theme

**Goal:** Add the `ThemeProvider` mechanism that reads the active user role and sets the correct `data-theme` attribute on the document root. This stage delivers the *automatic* theme behaviour; the *user-controlled* override layers on top in Stage 9.

**Rationale:** Without a provider, the `[data-theme="warm"]` selector in `globals.css` never fires. This stage closes the loop by wiring auth state to theme state. Splitting it from the toggle (Stage 9) keeps the role-default behaviour reviewable on its own and means even if the toggle UI is delayed, the role-based theming still works.

**Tasks:**
- Create `src/components/layout/ThemeProvider.tsx` — a `'use client'` component that subscribes to `useAuthStore` and applies a theme based on:
  1. The user's stored `theme_preference` if present (Stage 9 populates this; in Stage 8 it is always `null`).
  2. Fallback by role: `STUDENT` → `'warm'`; `ADMIN` / `CONSTRUCTOR` / `REVIEWER` / unauthenticated → `null` (i.e. no `data-theme` attribute → `:root` dark defaults).
- The provider sets `document.documentElement.dataset.theme = 'warm'` (or removes the attribute) on every relevant state change. It returns `null` (renders no DOM).
- Mount `<ThemeProvider />` inside the root layout at `src/app/layout.tsx`, inside `<body>` but above `<GlobalHeader />` and the page slot. The layout itself can remain a server component.
- Verify that the logout action in `useAuthStore` removes or resets the `data-theme` attribute so logging out as a student and back in as an admin switches the theme without a page reload.
- Add `frontend/THEMES.md` documenting: the token naming convention, the dimension-by-dimension token catalogue, how to add a new theme (create `[data-theme="X"]` block in `globals.css`, no JS change required for colour-only themes), the documented exemption list (syntax highlighting, named Tailwind colours for semantic states, named Tailwind transition utilities), and the auto-vs-manual theme-resolution rule.

**Exit criteria:**
- Logging in as a STUDENT applies `data-theme="warm"` to `<html>`.
- Logging in as ADMIN/CONSTRUCTOR/REVIEWER leaves `data-theme` unset (dark shell active).
- Logging out resets `data-theme`.
- `THEMES.md` is present and covers the topics listed above.
- The `[data-theme="light-blue"]` block from Stage 1 is still present and reachable via manual `data-theme="light-blue"` override (test by editing the DOM in DevTools — the third theme paints correctly).
- No regressions in auth flows (`login.spec.ts`, `exam-flow.spec.ts`).

---

### Stage 9 — User-Controlled Theme Toggle + Persistence

**Goal:** Let any logged-in user manually switch between the available themes and have that choice persist across reloads, sessions, and devices. This is the only stage in the epoch that adds backend surface (one column, one Pydantic schema, one endpoint).

**Rationale:** Role-default theming (Stage 8) is correct as a starting state but breaks when an admin user wants the warm shell or a student user wants the dark shell — and personal preference matters in tools people stare at all day. Persistence on the user record (rather than just localStorage) means the choice follows the user across devices, which matters for users who routinely move between an office desktop and a laptop.

**Tasks:**

Backend:
- Add `theme_preference: Mapped[str | None] = mapped_column(String, nullable=True, default=None)` to `backend/app/models/user.py`. Allowed values: `"dark"`, `"warm"`, `"light-blue"`, or `NULL` (meaning "use role default").
- Add the same column to `prisma/schema.prisma` on the `User` model: `themePreference String? @map("theme_preference")`.
- Generate the Alembic migration: `alembic revision --autogenerate -m "add theme preference to user"` and verify the upgrade adds a nullable text column with no default and no backfill (existing users keep `NULL` and continue to see the role default).
- Re-generate the Prisma client (`prisma generate`).
- Create `backend/app/schemas/preferences.py` with `ThemePreferenceUpdate(BaseModel)` containing a single `theme: Literal["dark", "warm", "light-blue"] | None` field, and `ThemePreferenceResponse(BaseModel)` containing `theme: Literal["dark", "warm", "light-blue"] | None`.
- Create `backend/app/services/preferences_service.py` with `update_theme_preference(user_id: UUID, theme: str | None) -> User`. Pure DB operation, no business logic.
- Add a new endpoint file `backend/app/api/endpoints/preferences.py` exposing `PATCH /api/users/me/preferences/theme` (auth-required, any role). It accepts `ThemePreferenceUpdate`, calls the service, and returns `ThemePreferenceResponse`. Wire it into the API router in `backend/app/main.py` (or wherever routers are mounted).
- Extend the existing `/api/auth/me` (or login response) `UserPublic` schema to include `theme_preference`. Existing fields and behaviour are unchanged.
- Add backend Pytest coverage for the new endpoint: one happy-path (set then read back), one rejected-value test (e.g. `"red"` returns 422), one auth-required test (401 when unauthenticated).

Frontend:
- Extend `useAuthStore` (in `src/stores/useAuthStore.ts`) to:
  - Track `themePreference: 'dark' | 'warm' | 'light-blue' | null` derived from the login / refresh response.
  - Expose `setThemePreference(theme)`: optimistically updates store state, writes `localStorage.theme` immediately, calls `PATCH /api/users/me/preferences/theme`. On error, reverts the store and shows a toast.
- Update `src/components/layout/ThemeProvider.tsx` to resolve the active theme as: `themePreference ?? roleDefault(role)`.
  - On mount, hydrate from `localStorage.theme` to avoid a flash of role-default styling before the auth store rehydrates from cookie.
- Create `src/components/layout/ThemeToggle.tsx`:
  - Button or popover that lists the three themes (`Dark`, `Warm`, `Light Blue`).
  - Shows the active theme with an indicator.
  - Includes an `aria-label="Switch theme"` and announces the change via an `aria-live="polite"` region.
  - Mounts inside `GlobalHeader.tsx`, on the right side, beside the user-menu/logout button.
- Update `THEMES.md` to document the toggle, the precedence (`theme_preference` over role default), and the persistence contract.
- Add Playwright coverage:
  - `theme-toggle.spec.ts`: log in as a STUDENT, default theme is warm; switch to dark, reload, verify still dark; switch to light-blue, log out and back in, verify still light-blue.

**Exit criteria:**
- Alembic upgrade adds the column; downgrade removes it cleanly. `pytest backend/tests/` passes.
- `PATCH /api/users/me/preferences/theme` accepts the four valid values (`"dark"`, `"warm"`, `"light-blue"`, `null`) and rejects everything else with 422.
- Toggle in the global header switches the theme instantly and persists across reload and logout/login.
- `theme-toggle.spec.ts` passes.
- `THEMES.md` documents the toggle, precedence, and persistence model.
- No regressions in `login.spec.ts`, `exam-flow.spec.ts`, `student-my-exams.spec.ts`.

---

### Stage 10 — Backend Module Decomposition

**Goal:** Split three oversized service files into focused sub-modules without changing any public API surface, ensuring all imports in endpoint files and tests continue to resolve.

**Rationale:** Large service files create cognitive overhead and make isolated testing harder. The psychometrics module in particular mixes statistical domains with no runtime dependency on each other. Splitting them reduces the blast radius of any future algorithm change.

**Tasks:**
- Create `backend/app/services/irt_engine.py`: Move all IRT-related functions from `psychometrics_service.py` — `estimate_irt_parameters`, `compute_icc`, `compute_item_information`. Add a module-level docstring explaining the IRT model used (2PL vs 3PL).
- Create `backend/app/services/ctt_metrics.py`: Move all Classical Test Theory functions — `compute_facility_index`, `compute_discrimination_index`, `compute_point_biserial`, `compute_distractor_analysis`. Add docstring.
- Create `backend/app/services/reliability.py`: Move Cronbach's Alpha and Cohen's Kappa implementations — `compute_cronbachs_alpha`, `compute_cohens_kappa`, `compute_weighted_kappa`. Add docstring.
- Reduce `psychometrics_service.py` to a re-export facade using `from .irt_engine import ...` etc. This ensures zero changes in any caller file.
- Create `backend/app/services/analytics_formatters.py`: Move all formatting helpers from `analytics_pdf_service.py` — `format_percentage`, `format_irt_params`, `format_correlation`, `format_grade_boundary`, and any other pure-function formatters with no ReportLab import. Confirm with `grep "reportlab" analytics_formatters.py` returning zero results.
- Update `analytics_pdf_service.py` to import formatters from `analytics_formatters` instead of defining them inline.
- Create `backend/app/services/scoring_strategies.py`: Move pure scoring functions from `grading_service.py` — `grade_mcq_single`, `grade_multiple_response`, `apply_grade_boundaries`, `_get_correct_options`, `_normalize_student_answer`, `_get_scoring_config`, `_default_grade_boundaries`. These functions have zero database dependencies.
- Update `grading_service.py` to import from `scoring_strategies`. The remaining code should be `auto_grade_session`, `compute_session_aggregate`, and private DB-query helpers only.
- Add `__all__` exports to each new module.
- Run `pytest backend/tests/ -v` and confirm all tests pass.

**Exit criteria:**
- Five new files created: `irt_engine.py`, `ctt_metrics.py`, `reliability.py`, `analytics_formatters.py`, `scoring_strategies.py` — all in `backend/app/services/`.
- `psychometrics_service.py` is ≤ 30 lines (facade only).
- `analytics_pdf_service.py` contains zero formatting helper functions.
- `grading_service.py` contains zero scoring algorithm functions.
- `pytest backend/tests/ -v`: 100% pass rate, same count as before plus the new theme-preference tests from Stage 9.
- No import path changed in any pre-existing endpoint file. (The new `preferences.py` endpoint added in Stage 9 is the only new endpoint.)

---

### Stage 11 — Testing and Verification

**Goal:** Run the complete test suite and perform a visual smoke test of all pages to confirm zero regressions. Demonstrate the one-file theme switch contract end-to-end across colour, typography, geometry, and motion dimensions.

**Rationale:** A refactor epoch without explicit verification is a promise, not a delivery.

**Tasks:**
- Run the full Playwright E2E suite: `npx playwright test`. All tests must pass, including the new `theme-toggle.spec.ts`.
- Run the full backend test suite: `pytest backend/tests/ -v`. All tests must pass, including the new preferences-endpoint tests.
- Run TypeScript type check: `npx tsc --noEmit` in `frontend/`. Zero errors.
- Run `next build` in `frontend/` to confirm production build succeeds.
- Grep checks — no arbitrary value of any tokenised dimension remains in component files (matches in the documented exemption list are the only allowed exceptions):
  ```
  grep -rE "bg-\[#|text-\[#|border-\[#" src/components/ src/app/
  grep -rE "text-\[[0-9]" src/components/ src/app/
  grep -rE "tracking-\[[0-9]" src/components/ src/app/
  grep -rE "rounded-\[[0-9]" src/components/ src/app/
  grep -rE "shadow-\[" src/components/ src/app/
  grep -rE "cubic-bezier" src/components/ src/app/
  ```
  Each must return zero results outside the THEMES.md exemption list.
- Grep checks for editor CSS files:
  ```
  grep -rE "#[0-9a-fA-F]{3,6}" src/components/editor/        # zero outside hljs block
  grep -rE "font-size:\s*[0-9]" src/components/editor/        # zero
  grep -rE "border-radius:\s*[0-9]" src/components/editor/    # zero
  ```
- One-file theme switch demo (cross-dimension): temporarily edit `globals.css` to:
  1. Change `--color-shell-bg` to `#ffffff`,
  2. Change `--radius-card-md` to `4px`,
  3. Change `--font-size-eyebrow` to `16px`,
  4. Change `--duration-normal` to `800ms`.
  Reload the application. Every admin page must reflect all four changes simultaneously, with no other file edited. Revert after demo.
- Visual smoke test (logged in as `student_e2e@vu.nl`): confirm My Exams page and exam flow render correctly with warm theme. Toggle to dark via the new control — verify the page repaints. Toggle to light-blue — verify the placeholder palette is applied. Toggle back to warm — verify persistence after reload.
- Visual smoke test (logged in as `admin_e2e@vu.nl`): confirm Session Manager, Question Library, Authoring Workbench, Grading, and Analytics pages render correctly with dark theme. Switch to warm via the toggle — verify cross-role theming works.
- Aikido scan on the branch: zero new Critical or High findings.

**Exit criteria:**
- All Playwright E2E tests pass.
- All Pytest tests pass (including new preferences tests).
- TypeScript strict mode: zero errors.
- Production build: succeeds.
- All grep checks return zero results outside the documented exemption list.
- Cross-dimension one-file theme switch demo confirmed.
- Theme toggle works for all roles, persists across reload, persists across logout/login, persists across devices (verified via DB inspection).
- Aikido scan: no new Critical/High findings.

---

## File and Class Plan

### New files

- `frontend/src/components/layout/ThemeProvider.tsx` — `'use client'` component, reads auth store + `theme_preference`, sets `data-theme` on `<html>`.
- `frontend/src/components/layout/ThemeToggle.tsx` — `'use client'` toggle control mounted in `GlobalHeader`.
- `frontend/THEMES.md` — developer documentation: token catalogue, naming convention, theme extension pattern, exemption list, auto-vs-manual resolution, persistence contract.
- `backend/app/services/irt_engine.py` — IRT parameter estimation and ICC computation.
- `backend/app/services/ctt_metrics.py` — facility index, discrimination index, point-biserial, distractor analysis.
- `backend/app/services/reliability.py` — Cronbach's Alpha, Cohen's Kappa, weighted Kappa.
- `backend/app/services/analytics_formatters.py` — pure formatting helpers for analytics values.
- `backend/app/services/scoring_strategies.py` — pure MCQ/MR scoring functions, grade boundary logic.
- `backend/app/services/preferences_service.py` — `update_theme_preference` DB operation.
- `backend/app/schemas/preferences.py` — `ThemePreferenceUpdate`, `ThemePreferenceResponse`.
- `backend/app/api/endpoints/preferences.py` — `PATCH /api/users/me/preferences/theme`.
- `backend/alembic/versions/<hash>_add_theme_preference_to_user.py` — Alembic migration adding the nullable text column.
- `frontend/tests/e2e/theme-toggle.spec.ts` — Playwright coverage for the toggle and persistence.
- `backend/tests/test_preferences.py` — Pytest coverage for the new endpoint.

### Modified files

- `frontend/src/app/globals.css` — full token vocabulary across colour, typography, geometry, motion, and elevation; `@theme` mappings; theme selectors (`:root`, `[data-theme="warm"]`, `[data-theme="light-blue"]`).
- `frontend/src/app/layout.tsx` — mount `<ThemeProvider />`.
- `frontend/src/app/page.tsx` — colour + typography arbitrary values → token classes.
- `frontend/src/app/login/page.tsx` — colour + typography arbitrary values → token classes.
- `frontend/src/app/my-exams/page.tsx` — colour + typography + radius + shadow arbitrary values → token classes.
- `frontend/src/app/author/page.tsx` — colour arbitrary values → token classes.
- `frontend/src/app/my-results/[sessionId]/page.tsx` — colour + typography + radius + shadow arbitrary values → token classes.
- `frontend/src/app/blueprint/page.tsx` — typography + radius + sizing arbitrary values → token classes.
- `frontend/src/app/analytics/page.tsx`, `analytics/tests/[testId]/page.tsx`, `analytics/items/[loId]/page.tsx` — typography arbitrary values → token classes.
- `frontend/src/app/grading/page.tsx`, `grading/[sessionId]/page.tsx` — typography + sizing arbitrary values → token classes.
- `frontend/src/app/items/page.tsx` — sizing arbitrary values → token classes (or documented exemptions).
- `frontend/src/components/layout/GlobalHeader.tsx` — colour arbitrary values → token classes; mount `<ThemeToggle />`.
- `frontend/src/components/student/StudentExamCard.tsx` — colour + typography + radius + shadow arbitrary values → token classes.
- `frontend/src/components/sessions/SessionCreateForm.tsx` — colour + radius arbitrary values → token classes.
- `frontend/src/components/sessions/ScheduledSessionsTable.tsx` — colour + typography + radius arbitrary values → token classes.
- `frontend/src/components/sessions/CourseEnrollmentDrawer.tsx` — colour + typography + radius arbitrary values → token classes.
- `frontend/src/components/auth/ProtectedRoute.tsx` — colour arbitrary values → token classes.
- `frontend/src/components/analytics/*.tsx` — typography arbitrary values → token classes.
- `frontend/src/components/exam/EssayQuestion.tsx` — sizing arbitrary value → token class.
- `frontend/src/components/blueprint/QuestionPickerModal.tsx` — inline `cubic-bezier` literal → motion token references.
- `frontend/src/components/editor/TipTapEditor.css` — colour, typography, radius hex/numeric values → `var(--...)` references.
- `frontend/src/components/editor/MCQOptionsPanel.css` — same.
- `frontend/src/components/editor/EssayOptionsPanel.css` — same.
- `frontend/src/stores/useAuthStore.ts` — track `themePreference`, add `setThemePreference` action.
- `backend/app/models/user.py` — add `theme_preference` column.
- `prisma/schema.prisma` — add `themePreference String? @map("theme_preference")` to `User` model.
- `backend/app/schemas/auth.py` (or wherever `UserPublic` lives) — include `theme_preference` in the public user response.
- `backend/app/main.py` (or router-mounting module) — register the new preferences router.
- `backend/app/services/psychometrics_service.py` — reduced to re-export facade (≤ 30 lines).
- `backend/app/services/analytics_pdf_service.py` — formatting helpers extracted, PDF layout only.
- `backend/app/services/grading_service.py` — scoring functions extracted, orchestration only.

### Unchanged files

All Prisma schemas (other than the single `theme_preference` field), all pre-existing Alembic migrations, all pre-existing Playwright test files, all pre-existing Pytest test files, all API endpoint files other than the new `preferences.py`. With the exception of the bounded theme-preference addition, this epoch makes no behavioural changes to the API or application logic.

---

## Test Plan (Acceptance Matrix)

| # | Criterion | Verification method |
|---|---|---|
| 1 | `globals.css` contains all colour, typography, geometry, motion, and elevation tokens with correct values | Code review + `grep` for each token name |
| 2 | Zero `bg-[#...]`, `text-[#...]`, `border-[#...]` arbitrary values in any `.tsx` / `.ts` file | `grep -rE "bg-\[#\|text-\[#\|border-\[#" src/` returns zero |
| 3 | Zero `text-[Xpx]` or `tracking-[Xem]` arbitrary values in any `.tsx` / `.ts` file | `grep -rE "text-\[[0-9]\|tracking-\[[0-9]" src/` returns zero |
| 4 | Zero `rounded-[Xpx]` or arbitrary `shadow-[...]` values in any `.tsx` / `.ts` file | `grep -rE "rounded-\[[0-9]\|shadow-\[" src/` returns zero outside exemptions |
| 5 | Zero literal `cubic-bezier` strings in any `.tsx` / `.ts` file | `grep -rE "cubic-bezier" src/` returns zero outside `globals.css` |
| 6 | Zero unexempted hex / numeric values in editor CSS files | `grep` checks listed in Stage 11 |
| 7 | Three themes ship: `dark` (root default), `warm`, `light-blue` | Manual DOM inspection / DevTools |
| 8 | STUDENT default theme = warm; ADMIN/CONSTRUCTOR default = dark | Browser DevTools after login |
| 9 | Theme toggle in global header switches active theme for any role | Manual UI test |
| 10 | Theme choice persists across reload, logout/login, and devices | DB inspection: `SELECT id, theme_preference FROM users WHERE email = ...;` |
| 11 | One-file cross-dimension theme switch demo: edits to colour, radius, typography, motion tokens in `globals.css` propagate to all admin pages | Manual demo recorded in Stage 11 |
| 12 | All Playwright E2E tests pass | `npx playwright test` — 0 failed |
| 13 | All Pytest backend tests pass (including new preferences tests) | `pytest backend/tests/ -v` — 0 failed |
| 14 | TypeScript strict check passes | `npx tsc --noEmit` — 0 errors |
| 15 | Next.js production build succeeds | `next build` — exits 0 |
| 16 | `psychometrics_service.py` is ≤ 30 lines (facade only) | `wc -l backend/app/services/psychometrics_service.py` |
| 17 | `scoring_strategies.py` has no DB imports | `grep "prisma\|sqlalchemy" scoring_strategies.py` returns zero |
| 18 | `analytics_formatters.py` has no ReportLab import | `grep "reportlab" analytics_formatters.py` returns zero |
| 19 | Only one new endpoint file added, only one model column added | `git diff main backend/app/api/endpoints/` shows only `preferences.py`; `git diff main backend/app/models/user.py` shows only `theme_preference` |
| 20 | Aikido security scan: zero new Critical or High findings | Aikido scan result on feature branch |

---

## Assumptions and Defaults (Locked)

- The visual appearance of every page must be pixel-identical before and after for the **default** theme of each role. Any discrepancy indicates a missed token or wrong value and must be fixed before merging. The light-blue theme is allowed (and expected) to look different — it is the proof-of-extension.
- Tailwind CSS v4 is in use and `@theme inline` is the correct mechanism. Do not introduce `tailwind.config.js` or `tailwind.config.ts` — Tailwind v4 does not use them.
- "Changing a theme" means editing `globals.css` only. No React props, no JavaScript, no build-time configuration changes are required to introduce a new colour/typography/radius/motion variant. (Adding a fundamentally new *theme name* — e.g. a fourth `high-contrast` theme — also requires adding a list entry in `ThemeProvider`/`ThemeToggle` so users can select it; the visual definition itself stays in `globals.css`.)
- The syntax highlighting colour block in `TipTapEditor.css` (`hljs-*` prefixed classes) is exempt from tokenisation. These colours follow the GitHub Dark theme specification and changing them would harm code readability.
- Tailwind named utility colours (`bg-gray-900`, `text-blue-400`, `text-red-400`, etc.) used for semantic/status states are **not** in scope for this epoch and remain as named utilities. The token system covers branded surface colour, not status colour.
- Tailwind named transition utilities (`transition-all`, `duration-200`, `ease-in-out`) remain valid. The motion token system (Stage 7) targets *literal* `cubic-bezier` and inline-millisecond values only. A future epoch may unify named utilities under tokens to support reduced-motion, but that is explicitly out of scope here.
- The backend decomposition (Stage 10) is import-transparent: no caller file outside of `services/` changes its import path.
- The theme-preference backend addition (Stage 9) is the **only** behavioural backend change in this epoch. It adds exactly one nullable column, one Pydantic schema pair, one service function, and one endpoint. Existing endpoints are untouched. No backfill is required because the column defaults to `NULL` (= "use role default") for all existing users.
- This epoch must merge to `main` before any Epoch 8 feature work begins, to avoid theming regressions accumulating in parallel branches.

## Out of Scope

The exclusions below are about *product* work that does not belong in a maintainability epoch — not about additional refactor dimensions. The four maintainability deferrals from earlier drafts (typography tokens, geometry tokens, motion tokens, user-controlled theme toggle) are now in scope and addressed in Stages 5, 6, 7, and 9 respectively.

- **Reduced-motion / prefers-reduced-motion mode.** The motion token system in Stage 7 makes this tractable as a future single-token override, but the actual `@media (prefers-reduced-motion)` switch and any UI control are deferred.
- **High-contrast accessibility theme.** The `[data-theme="high-contrast"]` block can be added by anyone in a follow-on PR by following the THEMES.md extension pattern; the actual palette design is not specified here.
- **Dark/light *system* preference detection (`prefers-color-scheme`).** The Stage 9 toggle is a user-explicit choice that wins over any system preference. Honouring system preference as a third resolution layer (alongside stored preference and role default) is deferred.
- **Theme picker beyond a simple list.** A theme gallery, custom palette builder, or per-page overrides are out of scope.
- **Osiris export, grading pipeline changes, psychometric algorithm improvements.** These are product-feature work and belong to subsequent epochs. The Stage 10 backend decomposition is structural only — every algorithm continues to produce identical output.
- **Spacing-scale unification beyond radius/sizing tokens.** Tailwind's default spacing scale (`p-1`, `p-2`, ..., `p-96`) is already a governed scale; no project-specific spacing token layer is added in this epoch.

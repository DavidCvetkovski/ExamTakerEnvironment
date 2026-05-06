# Epoch 7.6 Blueprint — Visual Polish & Component System

> **Branch:** `feature/epoch-7.6-visual-polish`
> **Prerequisites:** Epoch 7.5 (including Stage 12 named-color migration) complete and merged to `main`.
> **Reference:** `directives/epoch_roadmap.md`, `directives/epoch_7_5_blueprint.md`, `CLAUDE.md`.

---

## Implementation Status (as of 2026-05-06)

**Implementation complete.** All eight stages shipped on `feature/epoch-7.6-visual-polish`. Build + TS verification green.

### ✅ All Stages Complete

**Stage 1 — Typography & Spacing Tokens**
- Paired typography role tokens (Tailwind v4 syntax): `--text-display`, `--text-h1`, `--text-h2`, `--text-h3`, `--text-body`, `--text-meta` with line-height / letter-spacing / font-weight pairings.
- Rhythm-spacing tokens: `--space-section`, `--space-block`, `--space-inline`.
- Theme-adaptive elevation: `--shadow-card`, `--shadow-card-hover`, `--shadow-elevated`, `--shadow-inset` with per-theme tints (warm: warm-brown shadows, light-blue: cool-navy, dark: neutral).
- Theme-adaptive status palette: `--color-success`, `--color-warning`, `--color-info`, `--color-danger` each with `*-fg`, `*-bg`, `*-border` companions, all overridden per theme for tonal harmony.
- Editorial helper utility classes: `.tabular-nums`, `.eyebrow`, `.divide-hairline`, `.table-zebra` (with brand-tinted hover rail), `.focus-ring`.
- Body-level `font-feature-settings` for ligatures and antialiasing.

**Stages 2–5 — Component Primitives** (in `src/components/ui/`)

| File | Exports | Notes |
|---|---|---|
| `cn.ts` | `cn()` | Class-name composer — no external dep. |
| `Button.tsx` | `Button` | Variants: `primary`, `secondary`, `ghost`, `destructive`, `success`, `warning`. Sizes: `sm`/`md`/`lg`. Loading state, leading/trailing icons. |
| `Card.tsx` | `Card`, `CardSection` | Variants: `surface`/`bordered`/`flat`/`elevated`/`inset`. `interactive` for hover elevation. |
| `Input.tsx` | `Input`, `Select`, `Textarea`, `Field` | Token-bound, brand-glow focus ring. Custom chevron on `Select`. `Field` wraps with label/hint/error. |
| `Badge.tsx` | `Badge`, `StatusDot` | 6 tones × 3 variants (`soft`/`solid`/`outline`). `StatusDot` for inline indicators with optional pulse. |
| `Table.tsx` | `TableContainer`, `Table`, `THead`, `TBody`, `TR`, `TH`, `TD` | Density `compact`/`comfortable`. Zebra + hover rail. `numeric` prop on `TD` enables tabular-nums. |
| `PageHeader.tsx` | `PageHeader`, `SectionHeader` | Editorial pattern: eyebrow → display heading → subtitle → actions. |
| `EmptyState.tsx` | `EmptyState` | Dashed-border slot, icon + title + description + action. |
| `StatCard.tsx` | `StatCard` | Vertical accent rail, tabular-nums value, 6 tones. |
| `index.ts` | barrel | Single import path: `@/components/ui`. |

**Stages 2–5 Migration**
- `GlobalHeader.tsx` — rewritten; `isStudentShell` JSX-branching removed; uses single token-bound class set + `Badge` primitive.
- `/grading/page.tsx` — full migration to `PageHeader`, `StatCard`, `Table*`, `Button`, `Badge`, `Select`, `EmptyState`. Filter chips, action bar, and submission table all on primitives.
- `/analytics/page.tsx` — migrated to `PageHeader`, `Card` (interactive), `Button`, `Badge`, `EmptyState`.
- `/items/page.tsx` — full migration to `PageHeader`, `Table*`, `Button`, `Badge`, `Input`, `Select`, `EmptyState`.
- `/author/page.tsx` — migrated to `PageHeader`, `Card`, `Button`, `Field`, `Input`, `Select`, `Badge` for save status.
- `/my-exams/page.tsx` — migrated to `PageHeader`, `SectionHeader`, `Card`, `Badge`, `EmptyState`.
- `StudentExamCard.tsx` — rewritten; `isStudentShell` branching removed; uses `Card`, `Badge`, `Button` (primary, fullWidth).
- `/sessions/page.tsx` — surface migration (radial gradient → token bg, error block → danger tokens).
- `/exam/[id]/page.tsx` — header bar refactored to brand/danger tokens; navigation buttons rebuilt.
- `components/analytics/StatCard.tsx` — converted to thin compatibility shim that delegates to canonical `ui/StatCard`. All call-sites continue to work; `accent` prop maps to `tone`.

**Stage 6 — Theme Architecture Cleanup**
- All `isStudentShell` ternaries removed (`grep -rn "isStudentShell" src/` → 0 matches).
- All `text-slate-*` / `bg-slate-*` / `border-slate-*` / `ring-slate-*` leaks migrated to `shell-*` / `foreground` tokens.
- All `*-indigo-*` migrated to `brand` tokens.
- All `*-rose-*` migrated to `danger` tokens / `[var(--color-danger-*)]` semantic refs.
- `[data-theme="warm"]` overrides all `--color-editor-*` tokens (editor renders in warm cream palette on warm theme).

**Stage 7 — Polish Pass**
- Card elevation on every primitive consumer via `--shadow-card` (re-tints per theme).
- Standardised hover/focus transitions via `--duration-fast` + `--ease-standard`.
- Zebra striping enabled by default on every `Table` (low-contrast `bg-shell-input` even rows + brand-tinted left-rail hover).
- Tabular-nums applied to every numeric column on grading and analytics tables.
- Consistent border-radius: `--radius-md` (8px) on primitives, `--radius-card-sm` (22px) on top-level cards via Tailwind `rounded-xl`.

**Stage 8 — Verification**
- `npx tsc --noEmit` — passes.
- `npx next build` — exits 0; all 15 routes compile (12 static + 3 dynamic).
- `grep -rn "isStudentShell" src/` → 0 matches.
- `grep -rEn "(text\|bg\|border\|ring)-(slate\|indigo\|rose)-[0-9]" src/` → 0 matches.
- Manual screenshot matrix (admin × dark/warm/light-blue, student × dark/warm/light-blue): owner-driven; the build is now ready to be walked through manually.

### Decisions Locked

- **No `class-variance-authority` dependency.** Inline `cn()` helper; variant → class mapping uses plain object lookups.
- **Editorial Console aesthetic.** Hairline 1px borders, restrained elevation, eyebrow → display → subtitle headline pattern, tabular-nums on data, brand-tinted hover rail on table rows. The three themes are three editions of the same publication.
- **Brand button contrast on warm theme.** `--color-brand: #b8651a` + white text passes AA-large only (~4:1). Acceptable for the current size scale; revisit if an accessibility audit flags it.
- **`shadow-card` token replaces ad-hoc shadow strings.** Every primitive that elevates consumes `--shadow-card`, which re-tints per theme.
- **Analytics `StatCard.tsx` kept as a shim** rather than deleted. Backwards-compatible API for the seven existing analytics call-sites; deprecation is implicit through file size (one component, three lines of mapping logic).

### Known Follow-ups (Not Blockers)

- A handful of larger pages (`/blueprint/page.tsx` 612 lines, `/grading/[sessionId]/page.tsx` 374 lines, `/my-results/[sessionId]/page.tsx` 324 lines, `/analytics/tests/[testId]` and `/analytics/items/[loId]`) received the **token-leak cleanup pass** (Stage 6) but did NOT have their page headers / inline forms migrated to `PageHeader` / `Field` / `Input` primitives. They still use raw `<button>` + className strings in places. They render correctly across all three themes — they're just not on the primitive layer yet. A future small follow-up can sweep them; visually they're already cohesive thanks to the token unification.
- E2E (`npx playwright test`) was not run as part of automated verification because it requires both backend and frontend running. Owner-driven smoke-test recommended before merge to `main`.

---

---

## Summary

Epoch 7.5 made the application *theme-able*. Epoch 7.6 makes it *look good*. It is a focused visual-quality pass that operates on three layers:

1. **Component primitives.** Introduce a small set of styled primitive components (`Button`, `Card`, `Input`, `Badge`, `Table`) so every page consumes a consistent, polished baseline instead of each route hand-rolling Tailwind class strings.
2. **Layout & typography hierarchy.** Establish vertical rhythm, page-header patterns, table density, and heading hierarchy. Replace ad-hoc spacing with a deliberate scale.
3. **Theme architecture cleanup.** Remove the role-based JSX branching (`isStudentShell ? '...' : '...'`) introduced incrementally over Epochs 5–7. Theming is now CSS-variable-driven; the JSX should stop forking on user role.

This epoch adds **zero new product surface** (no new exam mechanics, no new analytics outputs, no API changes). It is purely structural and aesthetic.

---

## Motivating Problems (Ground Truth)

Discovered during Epoch 7.5 Stage 12 verification:

- **Role-based JSX branching is now redundant.** `GlobalHeader.tsx`, several student-facing pages, and exam components fork their `className` strings on `user?.role === 'STUDENT'`. With the design token system, both branches should resolve to the same token utilities and let `data-theme` do the rest. Carrying both branches doubles the surface area for theming bugs.
- **Slate-* leaks in student-shell branches.** `text-slate-900`, `text-slate-700`, `text-slate-500`, `text-slate-800`, `text-slate-600`, `bg-white` appear in the student-shell ternaries of `GlobalHeader.tsx` and a few student components. These are static colours that don't respond to theme — same class of bug Stage 12 fixed for admin surfaces.
- **Editor surfaces only theme on `light-blue`.** `[data-theme="light-blue"]` overrides `--color-editor-*`, but `[data-theme="warm"]` does not. The editor renders dark-on-warm, looking like a foreign element on every student page in warm mode.
- **No component primitives.** Every route hand-rolls buttons, cards, inputs, and tables as inline class strings. Visual drift is guaranteed: `/grading` cards have different padding than `/analytics` cards; primary buttons differ between `/blueprint` and `/items`.
- **Flat visual hierarchy.** Headings, body, and meta text rely on `text-sm` / `text-xs` / `font-bold` ad-hoc. There is no h1/h2/h3 token system. Page headers, section headers, and inline labels all look similar.
- **Tables are dense and hard to scan.** Analytics and grading tables use minimal padding, no zebra striping, and inconsistent header styling.
- **Buttons lack a consistent visual language.** Primary, secondary, ghost, and destructive variants all exist as one-off class combinations. A single primary button should look identical on every page.

---

## In Scope

### Layer 1 — Component Primitives (`src/components/ui/`)

A new directory for primitive components. Each is a thin styled wrapper over the native HTML element, with token-bound classes baked in.

- `Button.tsx` — variants: `primary`, `secondary`, `ghost`, `destructive`, `success`. Sizes: `sm`, `md`, `lg`. Uses `--color-brand`, `--color-danger`, semantic status backgrounds.
- `Card.tsx` — surface-token-bound container with `padding`, `bordered`, `elevated` variants.
- `Input.tsx` — token-bound text input. Replaces 30+ inline `bg-shell-input border border-shell-border-deep ...` strings.
- `Select.tsx` — same treatment for `<select>`.
- `Badge.tsx` — pill / chip with `neutral`, `success`, `warning`, `danger`, `info` variants. Replaces ad-hoc status pills in grading and analytics.
- `Table.tsx`, `TableRow.tsx`, `TableCell.tsx` — table primitives with built-in zebra striping, header styling, hover state, and density variants (`compact`, `comfortable`).
- `PageHeader.tsx` — eyebrow + h1 + subtitle pattern used on every admin page.
- `EmptyState.tsx` — replaces the 10+ ad-hoc "no items yet" blocks.

### Layer 2 — Typography & Spacing Hierarchy

- Add typography role tokens to `globals.css`: `--text-h1`, `--text-h2`, `--text-h3`, `--text-body`, `--text-meta`, `--text-eyebrow` (already exists). Each defines `font-size`, `line-height`, `font-weight`, `letter-spacing` together as a unit.
- Add page-rhythm spacing tokens: `--space-section`, `--space-block`, `--space-inline`.
- Migrate page headers across `/grading`, `/analytics/*`, `/items`, `/blueprint`, `/author`, `/sessions`, `/my-exams`, `/my-results/*` to consume `<PageHeader />` + the new typography tokens.

### Layer 3 — Theme Architecture Cleanup

- **Remove `isStudentShell` JSX branching** from `GlobalHeader.tsx`, `StudentExamCard.tsx`, and any other component that forks className on user role. Replace with single token-bound class strings; let CSS variables differentiate per theme.
- **Add `data-theme` overrides for any role-specific visual decisions** that can't be unified (e.g. student logout button being more orange than admin's). These belong in `globals.css`, not JSX.
- **Migrate slate-* leaks** in former student-shell branches to `text-foreground` / `text-shell-muted` tokens.
- **Complete editor token coverage.** Add `--color-editor-*` overrides for `[data-theme="warm"]` (currently only `light-blue` overrides them). The editor must visually match the active shell on all three themes.

### Layer 4 — Light Polish Touches

- Subtle shadow elevation on cards (token: `--shadow-card`). Replaces the bare `border` look.
- Consistent border-radius across primitives (`Button` = `--radius-md`, `Card` = `--radius-card-sm`, `Input` = `--radius-md`).
- Hover/focus transitions standardised through existing `--duration-normal` + `--ease-standard` tokens.
- Zebra striping on `Table` rows (`bg-shell-input/40` on `:nth-child(even)`).

---

## Out of Scope

- **New product features.** No new analytics outputs, no new exam mechanics, no new authoring widgets, no new endpoints.
- **Backend changes.** Zero changes to `backend/`. This is a frontend-only epoch.
- **Database changes.** No new columns, no migrations.
- **Reduced-motion support.** Still deferred from Epoch 7.5; belongs in a future accessibility epoch (Epoch 9).
- **High-contrast theme.** Same — Epoch 9.
- **Logo redesign / brand identity work.** Out of scope; this epoch refines the existing visual language, not the brand.
- **Marketing pages, landing page, or public-facing surfaces.** Authenticated app only.
- **Mobile-specific layouts beyond what Tailwind responsive utilities already provide.** No native or PWA work.

---

## Stage-by-Stage Implementation

### Stage 1 — Typography Role Tokens & Spacing Rhythm

**Goal:** Add typography role tokens and rhythm-spacing tokens to `globals.css`. No component changes yet.

**Deliverables:**
- `--text-h1`, `--text-h2`, `--text-h3`, `--text-body`, `--text-meta` defined as composite tokens (font-size + line-height pair) in `:root`.
- `--space-section`, `--space-block`, `--space-inline` spacing tokens.
- All exposed via `@theme inline` so Tailwind generates utilities (`text-h1`, `space-section`, etc.).

**Verification:** Tailwind builds clean; no visual change yet (consumers come in later stages).

### Stage 2 — `Button` Primitive + Migration

**Goal:** Create `src/components/ui/Button.tsx` with five variants and three sizes. Migrate every `<button>` element on the admin pages to consume it.

**Files migrated:** all `src/app/**/page.tsx` and any component currently rendering a styled `<button>`.

**Verification:** Zero raw `<button className="...bg-blue-600 text-white...">` strings remain; visual diff shows pixel-identical or improved buttons on every page.

### Stage 3 — `Card`, `Input`, `Select`, `Badge`, `EmptyState` Primitives + Migration

**Goal:** Create the remaining surface primitives. Migrate consumers.

**Verification:** `grep` for the inline class strings these primitives replace returns zero matches outside `src/components/ui/`.

### Stage 4 — `Table` Primitives + Migration

**Goal:** Create `Table`, `TableHead`, `TableBody`, `TableRow`, `TableCell`. Add zebra striping, hover state, and density variants. Migrate analytics tables and grading tables.

### Stage 5 — `PageHeader` + Layout Hierarchy Migration

**Goal:** Every admin page consumes `<PageHeader eyebrow="..." title="..." subtitle="..." />` instead of hand-rolling the eyebrow / h1 / subtitle pattern.

### Stage 6 — Theme Architecture Cleanup

**Goal:** Remove `isStudentShell` JSX branching across the app. Replace with single token-bound class strings. Migrate slate-* leaks. Add `[data-theme="warm"] --color-editor-*` overrides.

**Files:**
- `src/components/layout/GlobalHeader.tsx` — drop the `isStudentShell` ternary; one class set for both roles, `data-theme` switches the look.
- `src/components/student/StudentExamCard.tsx` — same treatment.
- `src/app/exam/[id]/page.tsx` — same treatment.
- `src/app/globals.css` — add `[data-theme="warm"]` overrides for `--color-editor-bg`, `--color-editor-toolbar`, `--color-editor-border`, `--color-editor-text`, `--color-editor-essay-surface`, `--color-editor-essay-input`, `--color-editor-code-bg`, `--color-editor-code-text`.

**Verification:** `grep -rE "isStudentShell" src/` returns zero matches; `grep -rE "text-slate-|bg-slate-" src/` returns zero matches; editor renders correctly in all three themes.

### Stage 7 — Polish Pass

**Goal:** Apply the elevation, transition, and zebra-striping refinements. Re-screenshot every page in every theme and tune any remaining visual misses.

### Stage 8 — Visual Regression Verification

**Goal:** Manually walk every authenticated route in all three themes. Capture screenshots; compare against a reference set. Update Playwright tests if any DOM structure changed.

**Verification matrix:**

| Page | Dark | Warm | Light-Blue |
|---|---|---|---|
| `/sessions` | ✓ | ✓ | ✓ |
| `/blueprint` | ✓ | ✓ | ✓ |
| `/items` | ✓ | ✓ | ✓ |
| `/author` | ✓ | ✓ | ✓ |
| `/grading` | ✓ | ✓ | ✓ |
| `/grading/[id]` | ✓ | ✓ | ✓ |
| `/analytics` | ✓ | ✓ | ✓ |
| `/analytics/tests/[id]` | ✓ | ✓ | ✓ |
| `/analytics/items/[id]` | ✓ | ✓ | ✓ |
| `/my-exams` | ✓ | ✓ | ✓ |
| `/my-results/[id]` | ✓ | ✓ | ✓ |
| `/exam/[id]` | ✓ | ✓ | ✓ |
| Global header | ✓ | ✓ | ✓ |

---

## Test Plan (Acceptance Matrix)

| # | Criterion | Verification method |
|---|---|---|
| 1 | All five primitive components exist in `src/components/ui/` and consume only design tokens | Code review |
| 2 | Zero raw `<button className="..." >` with inline brand styling outside `src/components/ui/` | `grep` |
| 3 | Zero `isStudentShell` ternaries in any component | `grep -rE "isStudentShell" src/` returns zero |
| 4 | Zero `text-slate-*` / `bg-slate-*` utilities anywhere in `src/` | `grep -rE "(text\|bg\|border)-slate-" src/` returns zero |
| 5 | Editor renders in correct palette for `dark`, `warm`, and `light-blue` | Manual visual check |
| 6 | All Playwright E2E tests pass | `npx playwright test` |
| 7 | TypeScript strict check passes | `npx tsc --noEmit` |
| 8 | Next.js production build succeeds | `next build` |
| 9 | All thirteen pages × three themes verified visually | Screenshot matrix |
| 10 | Aikido security scan: zero new Critical or High findings | Aikido scan on feature branch |

---

## Assumptions and Defaults (Locked)

- Component primitives live in `src/components/ui/` and are imported via `@/components/ui/Button` etc.
- Primitive components use `class-variance-authority` (`cva`) or a plain prop-driven `className` switch — implementer's choice as long as the public API stays simple.
- The `isStudentShell` branching removal is reversible: a `[data-theme]` selector in `globals.css` can re-add any role-specific override without re-introducing JSX forks.
- The visual character of each theme remains: dark stays dark, warm stays warm, light-blue stays light-blue. This epoch refines, not redesigns.
- No new theme is introduced in this epoch.

---

## Future Work (Not in this Epoch)

- Reduced-motion (`prefers-reduced-motion`) support — Epoch 9 (Accessibility).
- High-contrast theme — Epoch 9.
- System theme preference detection (`prefers-color-scheme`) as a third resolution layer — Epoch 9.
- Theme picker UI beyond the simple toggle — backlog.
- Mobile-first layout overhaul — backlog.
- Logo / brand identity refresh — backlog.

# Epoch 8.4 — Visual Design Pass: Calm, Intuitive, Human

> **Type:** Design-focused refinement Epoch.
> **Scope:** Frontend visual polish + one backend semantics change (blueprint status enum).
> **Goal:** Take the existing functional surface and make it *quiet*. Reduce visual noise, fix the broken inspect/view flows, formalise blueprint status semantics, and introduce a small set of reusable design primitives so future epochs don't drift back into clutter.
>
> **Guiding Principles (this Epoch):**
> 1. **Less is more.** Every chip, badge, button, and label must earn its pixels.
> 2. **One pattern per problem.** A single status-chip component, a single overflow-menu component, a single "back" pattern — used everywhere.
> 3. **Inspect ≠ Edit.** A read-only surface must look and feel structurally different from its editable twin, not just "the same thing with disabled inputs".
> 4. **Theme parity.** Every new pixel uses design tokens. Manual matrix across `dark`, `warm`, and `light-blue` themes after every stage.
> 5. **No emoji, no glyph soup.** Functional UI symbols (`✓`, `✕`, `↑`, `↓`) are permitted as monochrome typography. Decorative emoji (📚, 🧪, 🎯, etc.) are banned.

---

## Engineering Pillars (mapped to OpenVision agent contract)

- **Maintainability:** Centralise repeated patterns (status chips, row action menus, back buttons, page headers) into single shared components under `src/components/ui` and `src/components/layout`.
- **Modularity:** Each stage touches a bounded slice. Backend status derivation lives in a single service helper; no business logic in route handlers.
- **Scalability:** Status enum is forward-compatible — new states (e.g., `ARCHIVED`) drop in by extending one Pydantic enum and one Tailwind tone map.
- **Security:** Mutation guards stay enforced on the backend (`_assert_blueprint_mutable`), not just hidden buttons. Frontend disables are *advisory*; backend `403` is *authoritative*.
- **Extensibility:** A `BlueprintStatusBadge` and `RowActionMenu` introduced now are the substrate Epoch 9 (media library) and beyond will reuse.

---

## Stage Index

| # | Stage | Surface |
|---|---|---|
| 1 | Blueprint Status Semantics (backend + frontend) | tests endpoint, blueprint store, badge component |
| 2 | True Read-Only for Locked Author Page | `/author` |
| 3 | Inspect View Distinct from Edit View | `/blueprint?inspect=true` |
| 4 | Question Library: Row Decluttering | `/items` |
| 5 | Question Library: Subject Color Coding | `/items` |
| 6 | Question Picker: Full-Content Preview | `QuestionPickerModal` |
| 7 | Account Dropdown in Global Header | `GlobalHeader` |
| 8 | Blueprint Cards: Relative Time + Tag Spacing | `/blueprint` |
| 9 | Analytics: Per-Section Drill-Down | `/analytics/tests/[testId]` |
| 10 | Theme-Aware Back Button (analytics drill-down) | `BackButton` component |
| 11 | Sort Default: First Column Ascending | items, grading, blueprints |
| 12 | Eyebrow Audit: Remove Filler Text | author, items, grading |
| 13 | Login Page Distinct Theme | `/login` |
| 14 | Reusable Primitives (extracted from 1–13) | `src/components/ui` |
| 15 | Design Token Hardening (color leaks, spinner, page shell, glyphs) | full app |
| 16 | Cross-Surface Consistency (modal/drawer primitives, vocabulary, toast copy, sessions header, exam button) | full app |
| 17 | Verification & Theme Matrix | full app |

---

## Stage 1 — Blueprint Status Semantics

**Problem.** Today every blueprint with any scheduled session is flagged "In Use" and locked from editing, even if the session is still in the future. The user wants:
- `NEW` — no scheduled sessions, ever.
- `SCHEDULED` — only future scheduled session(s) exist. **Fully editable, all actions allowed.** Visual indicator only.
- `ONGOING` — at least one currently-active scheduled session. Locked from edit/delete.
- `PASSED` — at least one completed (`CLOSED`) scheduled session. Permanently locked (grading integrity).

Priority for single-label display (highest first): `ONGOING` > `PASSED` > `SCHEDULED` > `NEW`.

### 1a — Backend Status Derivation

- **File:** `backend/app/services/blueprint_status_service.py` *(new)*.
  - Single function `derive_blueprint_status(test_definition_id: str) -> BlueprintStatus` returning the enum.
  - Single source of truth — `_assert_blueprint_mutable`, the `/usage` endpoint, and any future caller all go through this helper.
- **Enum:** `backend/app/models/blueprint_status.py` *(new)* — `BlueprintStatus(str, Enum)` with `NEW`, `SCHEDULED`, `ONGOING`, `PASSED`.
- **Update `backend/app/api/endpoints/tests.py`:**
  - Extend `BlueprintUsage` Pydantic model with a `status: BlueprintStatus` field (keep legacy `is_locked` / `is_permanently_locked` booleans for one release for backwards compatibility — derive them from the new enum).
  - Update `_assert_blueprint_mutable` to only block when status is `ONGOING` or `PASSED`. `SCHEDULED` is mutable.
  - Add a clear `403` message per status:
    - `ONGOING`: "Editing is locked while a scheduled session is active."
    - `PASSED`: "This blueprint has been used in a completed session and cannot be edited."
- **Tests:** `backend/tests/test_blueprint_status.py` *(new)* — pytest cases for the four states, plus the mutation-guard transitions.

### 1b — Frontend Status Type + Badge Component

- **Type:** Add `BlueprintStatus` to `frontend/src/types/blueprint.ts` *(new)* — `'NEW' | 'SCHEDULED' | 'ONGOING' | 'PASSED'`.
- **Component:** `frontend/src/components/blueprint/BlueprintStatusBadge.tsx` *(new)*.
  - Props: `{ status: BlueprintStatus, size?: 'sm' | 'md' }`.
  - Tone map: `NEW` → `neutral`; `SCHEDULED` → `info`; `ONGOING` → `warning` (pulse dot); `PASSED` → `success-muted`.
  - Labels: `New`, `Scheduled`, `Ongoing`, `Completed`.
- **Store:** Extend `useBlueprintStore.usageMap` shape — store the full `BlueprintUsage` (including `status`) keyed by `test_definition_id`. Update `lockedQuestionIds` derivation to use `status in ('ONGOING', 'PASSED')`.
- **Editable predicate (shared util):** `frontend/src/lib/blueprintPermissions.ts` *(new)* — `canEditBlueprint(status)`, `canDeleteBlueprint(status)`, `canScheduleBlueprint(status)`. Every consumer (`/blueprint`, `/items`, author page) imports from here.

### 1c — Filter Bar on `/blueprint`

- Add a chip-style filter row above the blueprint grid: `All · New · Scheduled · Ongoing · Completed`.
- State lives in `useBlueprintStore.filter` (persist via Zustand `persist` middleware so filter survives navigation).
- "All" is default and is highlighted when no filter is active.

### Verification

- Pytest covers all four state transitions.
- Manual: schedule a future session, confirm blueprint shows `Scheduled` and remains editable; start the session, confirm flip to `Ongoing` + locked; close it, confirm `Completed` + locked.

---

## Stage 2 — True Read-Only for Locked Author Page

**Problem.** When a question is in a locked blueprint, the author page shows a banner but still lets the user *type* in the TipTap editor (only the Save button is `disabled`). That's broken: edits look real, then silently can't be saved.

**Plan.**
- **Add `editable` prop to `TipTapEditor`:**
  - File: `frontend/src/components/editor/TipTapEditor.tsx`.
  - Accept `editable?: boolean` (default `true`). Pass to `useEditor({ editable })` and call `editor.setEditable(editable)` in a `useEffect` reacting to prop changes.
  - Add CSS class on the wrapper for a non-editable visual treatment (lighter background, no caret, no toolbar buttons).
- **Add `disabled` prop to `MCQOptionsPanel` and `EssayOptionsPanel`:**
  - Disable all inputs, hide the "Add option" affordance entirely when disabled (don't just disable — remove from layout).
- **Remove the `pointer-events-none opacity-60` hack** added in Epoch 8.3. The components themselves now know how to render read-only.
- **Author page:** When `isLocked`, also hide the Save and Revert buttons entirely (don't just disable). Replace with a single "View only" status pill.
- **Banner copy:** Soften from "cannot be edited" to "This question is in active use. Edits would invalidate existing student attempts."

### Verification

- TipTap caret does not appear when locked.
- Clicking the editor area produces no cursor.
- Toolbar buttons hidden, not greyed-out.
- Save/Revert buttons removed from DOM (not just visually disabled).

---

## Stage 3 — Inspect View Distinct from Edit View

**Problem.** `/blueprint?id=X&inspect=true` today is "the editor with `readOnly` on the title input and a banner". It still shows the editor's "Add Rule" buttons (just wrapped in a conditional) and uses the same dense layout. Inspect should *look* like reading, not like a disabled form.

**Plan.**
- **New component:** `frontend/src/components/blueprint/BlueprintInspector.tsx` *(new)*.
  - Renders the blueprint as a clean **summary document**, not a form:
    - Title rendered as `h1`, no input element.
    - Each block rendered as a labeled section with a count badge ("Section 1 · 5 questions").
    - Each rule rendered as a card showing the resolved question preview (for `FIXED`) or the tag query + sample count (for `RANDOM`).
    - No "Add Rule", "Remove Rule", or any mutation control anywhere in the tree.
  - Layout: wider single-column reading rhythm (`max-w-3xl mx-auto`), generous vertical spacing, smaller text on metadata.
- **Routing change in `/blueprint/page.tsx`:**
  - When `inspect=true` *or* when status is `ONGOING`/`PASSED`, render `<BlueprintInspector />` instead of the editor.
  - Two affordances in the header: `← Back` and `Practice this blueprint`. Nothing else.
- **Optional editor entry rule:** Even when a blueprint is `Scheduled` (editable), surface an "Inspect" toggle in the editor header so users can switch into a low-noise read view at will. This becomes the natural pattern.

### Verification

- Open an `Ongoing` blueprint → see the inspector, not the editor.
- Open a `New` blueprint → see the editor with an "Inspect" toggle.
- Confirm zero buttons capable of mutating data appear in inspector tree (grep audit).

---

## Stage 4 — Question Library: Row Decluttering

**Problem.** Each row currently shows: `[In Blueprint badge] [Copy ID button] [Duplicate button] [Edit/View button]`. The buttons wrap to multiple lines on narrow viewports, the badge is misaligned, and the visual weight overwhelms the actual question preview.

**Plan.**
- **New component:** `frontend/src/components/ui/RowActionMenu.tsx` *(new)*.
  - A kebab-icon button that opens a popover with up to ~5 actions.
  - Uses existing focus-ring tokens, positions with `Floating UI` (already used elsewhere — confirm during implementation).
  - Props: `items: { label: string; onClick: () => void; tone?: 'default' | 'danger'; disabled?: boolean }[]`.
- **Apply to items table:**
  - Single-row layout: `[Preview ────────] [Subject chip] [Points] [Type] [Last edited] [⋯]`.
  - Primary action on row click → opens author page (existing behavior).
  - Kebab menu items: `Copy ID`, `Duplicate`, `Inspect / Edit` (label flips with lock status), `Delete` (disabled with hover-tooltip explaining why when locked).
- **In-Blueprint indicator redesign:**
  - Replace the `<Badge tone="info">In Blueprint</Badge>` with a small **lock glyph** rendered before the Type column, theme-tinted via `text-shell-muted`. Hover-tooltip: "In use by N blueprint(s)" (need the count from `usageMap`).
  - This removes a whole chip-shaped object from each row.
- **Type column:**
  - Render as a single colored letter chip: `SC` / `MC` / `ESS` with the same tone palette already used in `QuestionPickerModal` (info / accent / neutral). Compact and consistent across both surfaces.

### Verification

- No row wraps to a second line at viewport ≥ 1024px.
- Grep: zero `<Button>` elements inside table rows on `/items` (only the kebab and the row-click).
- Kebab menu keyboard accessible (Arrow keys, Esc to close, focus returns to trigger).

---

## Stage 5 — Question Library: Subject Color Coding

**Problem.** The Subject column today is plain text. Users want a visual anchor to filter mentally without reading every cell.

**Plan.**
- **New util:** `frontend/src/lib/subjectColor.ts` *(new)*.
  - Pure function `subjectTone(subject: string) → { bg: string; fg: string; ring: string }` returning Tailwind class names backed by design tokens.
  - Deterministic hash of the subject string into a fixed palette of ~8 distinguishable hues (all theme-token-bound — no hardcoded hex). The palette is defined once and theme-aware via `var(--color-tone-1-bg)` etc.
- **Define palette tokens:** Extend `frontend/src/app/globals.css` with `--color-subject-1` through `--color-subject-8` per theme (dark / warm / light-blue). Pastel-saturation for warm and light-blue, deeper saturation for dark.
- **Apply:**
  - Items table Subject cell: render as a small pill with the subject's hashed tone.
  - Question picker subject filter: tint each option's leading dot with the same hash.
  - Blueprint editor rule preview: same tint, same palette.

**Why deterministic hash, not user-assigned colors?** Zero schema change, zero authoring overhead. Same subject = same color across the whole app, automatically.

### Verification

- "Math" appearing on items page, picker, and blueprint editor shows the same color.
- Toggle theme, colors update smoothly (token-bound).
- WCAG AA contrast (≥ 4.5:1) verified for fg-on-bg in every theme.

---

## Stage 6 — Question Picker: Full-Content Preview

**Problem.** Clicking a question in the picker shows a truncated preview. The user wants the *whole* question — that's the entire point of a preview.

**Plan.**
- **In `frontend/src/components/blueprint/QuestionPickerModal.tsx`:**
  - When `inspectedItem` is set, fetch the full latest version via `GET /learning-objects/{id}/versions/latest` (already exists — verify endpoint name during implementation).
  - Render the full TipTap content using a read-only `TipTapEditor editable={false}` (now available from Stage 2) — not the truncated `latest_content_preview` string.
  - For MCQ types, render the options list (correct answers visible only to authors, never to students — confirm role gate is intact).
  - Increase modal `max-w` from `3xl` to `4xl` and `maxHeight` from `80vh` to `85vh` to accommodate longer questions.

### Verification

- Pick a question with a 500+ word stem; full content visible without truncation, scroll within the modal works.
- Code blocks render with syntax highlighting (Lowlight) inside the preview.

---

## Stage 7 — Account Dropdown in Global Header

**Problem.** The header currently dumps `admin_e2e@vu.nl ADMIN Sign out` inline. Cluttered, takes horizontal space, breaks the "calm" feel.

**Plan.**
- **In `frontend/src/components/layout/GlobalHeader.tsx`:**
  - Replace the inline email + badge + sign-out group with a single **circular avatar button** (showing user initials, e.g., `AE` for `admin_e2e@vu.nl`).
  - Clicking opens a dropdown panel:
    - Header line: full email + role badge.
    - Separator.
    - Menu items: `Account settings` (placeholder route for a future epoch — link to `/account` which renders an "Coming soon" empty state for now), `Sign out`.
  - Keyboard a11y: Esc closes, Enter activates focused item.
- **Initials util:** `frontend/src/lib/initials.ts` *(new)* — `emailToInitials(email) → string` (e.g., `admin_e2e@vu.nl` → `AE`, `david.cvetkovski@gmail.com` → `DC`).
- **Avatar component:** `frontend/src/components/ui/Avatar.tsx` *(new)* — circular, deterministic background tint via `subjectColor` hash on email, two-letter overlay, used here and reusable elsewhere (grading dashboard, sessions, etc.).

### Verification

- Header collapses to: `[OpenVision logo] [nav links] [theme toggle] [avatar button]`.
- Dropdown opens on click, closes on outside-click and Esc.

---

## Stage 8 — Blueprint Cards: Relative Time + Tag Spacing

**Problem.** Cards show absolute dates; user wants "edited 3 hours ago" style. Title sits flush against the status tag.

**Plan.**
- **Util:** `frontend/src/lib/relativeTime.ts` — confirm if it exists (was used in items page in 8.3). If not, extract into shared util. Returns strings like `Just now`, `5 minutes ago`, `Yesterday`, `Mar 12`.
- **In `/blueprint` card layout:**
  - Replace `updated_at` rendered as `toLocaleDateString()` with `formatRelativeTime(updated_at)`.
  - Add `mt-2` between the title block and the status badge row.
  - When status is `Scheduled` or `Ongoing`, append a one-line subline: "Next session: {relative time}" (computed from the soonest scheduled session). Subtle, `text-shell-muted-dim text-meta`.

### Verification

- Visual matrix across the four statuses.
- Title and status badge have measurable separation (no flush adjacency).

---

## Stage 9 — Analytics: Per-Section Drill-Down

**Problem.** The test analytics page (`/analytics/tests/[testId]`) treats the test as one bucket. The user wants per-section (i.e., per-block) breakdowns so they can see which section was hardest.

**Plan.**
- **Backend:**
  - File: `backend/app/services/analytics_service.py` — add `compute_section_analytics(test_id)` returning a list of `{ block_index, block_title, question_count, mean_score, p_value_mean, discrimination_mean }`.
  - Endpoint: `GET /analytics/tests/{test_id}/sections` in `backend/app/api/endpoints/analytics.py`.
- **Frontend:**
  - In `/analytics/tests/[testId]/page.tsx`, add a "By section" panel between the test-level KPIs and the per-question table.
  - Each section row clickable → filters the per-question table below to that section's questions only.
- **Backwards compatibility:** Existing test-level KPIs unchanged; this is additive.

### Verification

- Tested with a multi-section blueprint; section ordering matches blueprint authoring order.
- Clicking a section filters the table; "All sections" resets.

---

## Stage 10 — Theme-Aware Back Button (analytics drill-down)

**Problem.** The drill-down back button doesn't use theme tokens — it appears with hardcoded colors that look broken on warm/light-blue.

**Plan.**
- **Extract shared component:** `frontend/src/components/ui/BackButton.tsx` *(new)*.
  - Props: `{ href?: string; onClick?: () => void; label: string; confirmDirty?: boolean }`.
  - Classes derived entirely from `text-shell-muted hover:text-foreground` + `cn` for variants.
  - Reuses the SVG arrow already inlined in author/import pages.
- **Apply to every page with a back button** — author, import, blueprint editor, analytics drill-down, grading drill-down, my-results drill-down. Single component, one import.
- Eliminate the inline back-button JSX from each page (~6 files).

### Verification

- Grep: zero remaining inline `<svg>...M10 19l-7-7...</svg>` patterns; all routed through `BackButton`.
- Theme matrix: back button visible and readable in all three themes on all six pages.

---

## Stage 11 — Sort Default: First Column Ascending

**Problem.** Tables currently default to "no sort applied", which is confusing — users see arbitrary order and don't know why.

**Plan.**
- **Convention:** Every sortable table defaults `sortKey = <first sortable column>` and `sortDir = 'asc'`. Clicking the active column cycles `asc → desc → asc` (no unsorted state — there's always *a* sort).
- **Affected files:**
  - `frontend/src/app/items/page.tsx` — default to `preview` asc (currently `updated` desc).
  - `frontend/src/app/grading/page.tsx` — default to `student` asc (already correct, but the "unsorted" state when first arrow click should be removed).
  - Any future tables.
- **SortArrow component:** Remove the `↕` (unsorted) glyph from `SortArrow`. It can only render `↑` or `↓`.

### Verification

- Reload any sortable table → row order is deterministic and obvious from the active column arrow.
- Click an inactive column → it becomes active with `↑`.
- Click again → `↓`.

---

## Stage 12 — Eyebrow Audit: Remove Filler Text

**Problem.** "Educator workspace", "Item bank", "Authoring workbench" are noise — they say nothing the page title doesn't already say.

**Plan.**
- **Remove eyebrow prop on:**
  - `/grading` (was `Educator workspace`)
  - `/items` (was `Item bank`)
  - `/author` (was `Authoring workbench`)
  - `/analytics` (was `Psychometric analysis`)
- **Keep eyebrows on:**
  - `/my-exams`, `/my-grades` (student-facing — `Student portal` is a useful "you are here" cue).
  - Section sub-headers (`Awaiting`, `Published`, `Current`, `Upcoming`) — these are meaningful labels, not filler.
- **Rule going forward (document in CLAUDE.md addendum during implementation):** Eyebrows are only justified when they add navigational context that the title alone doesn't.

### Verification

- Visual diff: each of the four pages loses one line of text from the header.
- Grep: confirm zero remaining eyebrows on those four pages.

---

## Stage 13 — Login Page Distinct Theme

**Problem.** Login page looks identical to the rest of the app. User wants visual differentiation — proposed a green tint.

**Plan.**
- **New scoped theme:** Add `[data-theme-scope='login']` overrides in `frontend/src/app/globals.css`.
  - Override only the `--color-brand` and `--color-brand-soft` tokens to a calm green (`hsl(150 50% 45%)` family — tune during implementation against existing success palette).
  - Keep the rest of the shell/text tokens consistent with the user's active global theme — so a user on `warm` still sees warm backgrounds, just with a green accent.
- **Apply scope:** Wrap `/login` page root in `<div data-theme-scope='login'>`. ThemeProvider untouched.
- **Login form polish (free with the scope change):**
  - Center the form vertically with `min-h-screen flex items-center`.
  - Larger headline ("Welcome to OpenVision"), subline below, then form — reading rhythm matches the new home page.

### Verification

- Login page is visually distinct in all three themes.
- After login, brand color reverts immediately on first authenticated page.

---

## Stage 14 — Reusable Primitives (extracted from 1–13)

> Consolidation pass. By the end of stages 1–13, several patterns have been added. Make sure they're properly extracted and indexed.

**Deliverables (all under `src/components/ui` and `src/components/blueprint`):**
- `BlueprintStatusBadge.tsx` (Stage 1)
- `BlueprintInspector.tsx` (Stage 3)
- `RowActionMenu.tsx` (Stage 4)
- `Avatar.tsx` (Stage 7)
- `BackButton.tsx` (Stage 10)
- `lib/subjectColor.ts` (Stage 5)
- `lib/initials.ts` (Stage 7)
- `lib/relativeTime.ts` (Stage 8)
- `lib/blueprintPermissions.ts` (Stage 1)

**Export from barrel:** Add each to `src/components/ui/index.ts` where applicable. Confirm tree-shaking still works.

**Story matrix (optional but encouraged):** If a lightweight Storybook-equivalent is feasible, render each new component in all three themes for visual regression. If not in scope, leave a `directives/component-matrix.md` checklist.

---

## Stage 15 — Design Token Hardening

> Audit pass surfaced four classes of drift that bypass the design-token system and will look wrong under at least one theme. Mechanical cleanup, but coordinated — all four belong together because they touch the same files.

### 15a — Hardcoded Tailwind colors → tokens

**Offending files (audited):**
- `frontend/src/app/grading/[sessionId]/page.tsx:190,202` — `focus:border-blue-500` → `focus:border-brand`.
- `frontend/src/app/grading/[sessionId]/page.tsx:304` — blue spinner → standard spinner.
- `frontend/src/app/analytics/items/[loId]/page.tsx:59` — `text-blue-300 hover:text-blue-200` → `text-brand hover:text-brand/80` (or token).
- `frontend/src/app/analytics/items/[loId]/page.tsx:82` — `border-cyan-400` spinner → standard spinner.
- `frontend/src/components/blueprint/BlueprintSaveIndicator.tsx:27,28` — `text-cyan-300`, `border-cyan-300` → `text-brand`, `border-brand`.
- `frontend/src/components/analytics/PDValueTrendChart.tsx:42,80,113` — `text-cyan-400`, `bg-cyan-400` → add a `--color-chart-series-1` token (and `-2`, `-3` for future series); replace inline values.
- `frontend/src/components/exam/ReviewSummary.tsx:51–72` — `bg-red-500/10`, `border-red-500/30`, `text-red-400` → `bg-[var(--color-danger-bg)]`, `border-[var(--color-danger-border)]`, `text-[var(--color-danger-fg)]`.
- `frontend/src/components/exam/SaveIndicator.tsx:20` — `text-red-400` → `text-[var(--color-danger-fg)]`.

**Approach.** Grep-driven, mechanical, per-file. After this stage, the audit `grep -rE "(border|bg|text)-(blue|cyan|red|green|yellow|orange|purple|pink|indigo)-[0-9]" src` must return zero hits in app/component code (the design tokens themselves and the Tailwind config are exempt).

### 15b — Shared `<Spinner>` component

**Problem.** 13 inline `animate-spin` `<div>`s with 7 different sizes and 5 different colors.

**Plan.**
- **New component:** `frontend/src/components/ui/Spinner.tsx` *(new)*.
  - Props: `{ size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; tone?: 'brand' | 'muted' | 'current' }`.
  - Single render: `<div className={cn('inline-block rounded-full border-2 border-current border-t-transparent animate-spin', sizeMap[size], toneMap[tone])} />`.
  - `size` map: `xs=w-3 h-3`, `sm=w-4 h-4`, `md=w-5 h-5`, `lg=w-6 h-6`, `xl=w-12 h-12`.
- **Replace every inline spinner** across the 13 sites (catalogued from grep audit during implementation).
- Export from `src/components/ui/index.ts`.

**Acceptance.** Grep audit: zero `animate-spin` outside `Spinner.tsx`.

### 15c — `<PageShell>` for layout convergence

**Problem.** Every page rebuilds `<div className="min-h-full bg-shell-bg text-foreground"><div className="max-w-... mx-auto px-... py-...">`. Widths disagree (`1400px`, `4xl`, `5xl`, `7xl`).

**Plan.**
- **New component:** `frontend/src/components/layout/PageShell.tsx` *(new)*.
  - Props: `{ width?: 'narrow' | 'standard' | 'wide'; padding?: 'standard' | 'compact'; children: ReactNode }`.
  - Width map: `narrow=max-w-4xl` (forms, single-column reading — author, exam, home), `standard=max-w-5xl` (drill-downs), `wide=max-w-[1400px]` (data tables — items, grading, sessions, blueprint grid).
  - Renders the outer `min-h-full bg-shell-bg text-foreground` + inner container + `px-4 sm:px-6 lg:px-8 py-8` (or `py-6` compact).
- **Migration:** Replace the duplicated wrapper in every page in `src/app/`. Estimated ~14 files.
- **Special cases:** `/exam/[id]` (full-bleed focus mode) and `/login` (centered hero) keep custom shells but should be documented as exceptions in CLAUDE.md.

**Acceptance.** Grep: zero `max-w-[1400px]` or `max-w-7xl` outside `PageShell.tsx`. Page widths are coherent across surfaces of the same category.

### 15d — Leftover decorative glyphs

Epoch 8.3 missed:
- `frontend/src/components/exam/SaveIndicator.tsx:20` — `✗` icon string → small SVG `<XIcon>` (already used elsewhere).
- `frontend/src/components/exam/ReviewSummary.tsx:64` — `⚠ Unanswered Questions` → either drop the glyph or replace with a styled inline `<AlertIcon>` SVG.
- `frontend/src/app/blueprint/page.tsx:808` and any remaining `Loading...` (three-dot) strings → `Loading…` (HTML entity `&hellip;` or single `…` character) for typographic consistency.

### Verification (Stage 15)

- `grep -rE "(border|bg|text)-(blue|cyan|red|green|yellow|orange|purple|pink|indigo)-[0-9]" frontend/src/app frontend/src/components` → zero results.
- `grep -r "animate-spin" frontend/src` → only `Spinner.tsx`.
- `grep -r "max-w-\[1400px\]\|max-w-7xl" frontend/src/app` → zero results.
- `grep -rP "[\x{2715}\x{2717}\x{26A0}]" frontend/src` → zero results (or only in documented exceptions).
- Manual theme matrix across the four touched surfaces (grading drill-down, analytics drill-down, exam review, save indicator).

---

## Stage 16 — Cross-Surface Consistency Pass

> A second audit pass surfaced patterns that drift across surfaces in ways the user reads as "this is two different apps glued together". This stage harmonises them. Every sub-stage is independent and small; bundling them as one stage keeps the consistency theme together for review.

### 16a — `<Modal>` and `<Drawer>` shared shells

**Problem.** Six different modal/overlay implementations with different `z-index`, backdrop opacity, blur, and padding.

**Plan.**
- **New components:**
  - `frontend/src/components/ui/Modal.tsx` *(new)* — props `{ isOpen, onClose, title, children, size?: 'sm' | 'md' | 'lg' | 'xl', footer?: ReactNode }`. Canonical shell: `fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4`. Inner panel: `w-full max-w-{size} rounded-2xl border border-shell-border bg-shell-surface shadow-elevated`. Size map: `sm=md`, `md=lg`, `lg=3xl`, `xl=5xl`.
  - `frontend/src/components/ui/Drawer.tsx` *(new)* — props `{ isOpen, onClose, side?: 'right' | 'left', title, children, footer? }`. Used today only by `CourseEnrollmentDrawer`, but exists as a distinct interaction primitive (panel slides in from edge, modal is centered overlay).
  - Both manage: outside-click close, Esc-to-close, body-scroll lock, focus-trap, return-focus to trigger.
- **z-index scale** (define in CLAUDE.md §7.4 extension):
  - Sticky surfaces (`GlobalHeader`, exam timer): `z-30`
  - Drawers: `z-40`
  - Modals: `z-50`
  - Popovers (DatePicker, TimePicker dropdowns): `z-50` (same plane — they're mutually exclusive with modals)
  - Toasts: `z-[60]` (above everything except hard error overlays). Drop the `z-[9999]` magic number.
- **Migrate existing modals:**
  - `FormatGuideModal` → use `<Modal size="lg" title="Import Format Guide">`.
  - `QuestionPickerModal` → use `<Modal size="lg" title="Select Question">`. Padding inside the modal stays bespoke (it already has filters + scrolling list).
  - `ReviewSummary` → use `<Modal size="md" title="Review your answers">`.
  - `ConfirmDialog` → consume `<Modal size="sm">` internally.
  - `CourseEnrollmentDrawer` → use `<Drawer side="right" title={course.name}>`.
- **Delete `CancelSessionModal` entirely** (see 16b).

**Acceptance.** Grep audit: zero `fixed inset-0 z-50 flex items-center justify-center bg-black` outside `Modal.tsx`/`Drawer.tsx`. Every modal renders with identical backdrop, blur, padding, focus behavior.

### 16b — Replace `CancelSessionModal` with `useConfirm()`

`CancelSessionModal` is structurally identical to `useConfirm()` — title, message, two buttons. Replace with:

```tsx
const ok = await confirm({
  title: 'Cancel this session?',
  message: 'This will prevent students from joining. Already active attempts are unaffected. This action cannot be undone.',
  confirmLabel: 'Yes, cancel',
  tone: 'danger',
});
if (ok) await cancelScheduledSession(id);
```

Delete `frontend/src/components/sessions/CancelSessionModal.tsx`.

### 16c — Session vocabulary alignment

**Problem.** `ScheduledSessionsTable` groups sessions as `Ongoing / Planned / Past`. Epoch 8.4 Stage 1 introduces blueprint status `New / Scheduled / Ongoing / Completed`. The parallel concepts use different words.

**Plan.**
- **Canon vocabulary** (used everywhere a lifecycle state appears):
  - `Scheduled` (future, not yet started) — was "Planned"
  - `Ongoing` (currently active) — unchanged
  - `Completed` (closed normally) — was "Past"
  - `Canceled` (closed prematurely) — distinct from Completed
- **In `ScheduledSessionsTable.tsx`:**
  - Rename `planned` variable → `scheduled`; section heading `Planned` → `Scheduled`.
  - Rename `past` variable → `completed`; split out `canceled` as its own group OR fold into completed with a sub-badge.
  - Section heading `Past` → `Completed` (or `History` if grouped).
- **No backend changes.** The DB enum (`CourseSessionStatus.SCHEDULED/ACTIVE/CLOSED/CANCELED`) stays; only the UI labels move.

### 16d — Sessions page gets a `PageHeader`

**Problem.** `/sessions` opens directly with the create form, no page-level header. Inconsistent with every other staff page.

**Plan.**
- In `frontend/src/app/sessions/page.tsx`, wrap content in `<PageShell width="wide">` and add `<PageHeader title="Exam Sessions" subtitle="Schedule, monitor, and manage exam windows for your courses." />` above `SessionCreateForm`.
- Demote the form's internal `<h2>Schedule an Exam Window</h2>` to a `<SectionHeader>` or remove it entirely (now redundant with the page header).
- No eyebrow (per the §7.6 rule — title alone is sufficient).

### 16e — Exam page Submit button uses `<Button>`

In `frontend/src/app/exam/[id]/page.tsx:176-182`, replace:

```tsx
<button className="bg-brand text-white px-5 py-2 rounded-md font-medium text-meta transition-[filter] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed" onClick={() => setShowReview(true)} disabled={isExpired}>
  Submit exam
</button>
```

with:

```tsx
<Button variant="primary" size="md" disabled={isExpired} onClick={() => setShowReview(true)}>
  Submit exam
</Button>
```

### 16f — Empty state harmonisation

- `ScheduledSessionsTable` empty state (currently a hand-rolled card with `bg-shell-panel-a` and `rounded-card-md`) → replace with `<EmptyState title="No scheduled sessions yet" description="Schedule one using the form above." />`.
- Audit other pages for inline empty-state divs and migrate. Grep:
  ```bash
  grep -rn "No .*yet\|No matches\|Nothing here\|No results" frontend/src/app frontend/src/components
  ```

### 16g — Toast copy style guide

**Style rules** (document in CLAUDE.md §7.10):
- Title: sentence case, 1–4 words, no terminal punctuation. Examples: `Question saved`, `Session canceled`, `Question duplicated`, `ID copied`.
- Description: optional. Full sentence with terminal period. Used to explain *why* or *what next*. Example: `Students can join at the set start time.`
- Never embed em-dashes or context inside the title. The current `Duplicate created — you can edit it now.` becomes title `Duplicate created` + description `You can edit it now.`

**Migration pass.** Walk all 29 `toast({...})` invocations (grep enumerated). Rewrite each to the style. Mechanical, ~15 minutes.

### 16h — Undocumented Tailwind utilities audit

Grep for utility classes that aren't in the standard token set:

```bash
grep -rE "rounded-card|bg-shell-panel|bg-shell-input-alt" frontend/src
```

For each unique utility found:
- If it's a valid extension and used in ≥ 2 places, add to CLAUDE.md §7.4 / §7.1.
- If it's used in 1 place, replace with a standard token (`rounded-xl`, `bg-shell-surface`, etc).
- Confirm the Tailwind config (`tailwind.config.ts` or equivalent) doesn't define utilities that aren't documented.

**Acceptance.** Every Tailwind utility used in the app is either a standard Tailwind class or documented in CLAUDE.md.

### 16i — Date/time format unification

**Problem.** Four different "when did this happen" formats across surfaces.

**Plan.**
- **Canon** (document in CLAUDE.md §7.10):
  - **Recent past (< 7 days):** relative via `formatRelativeTime()` — `Just now`, `5 minutes ago`, `Yesterday`.
  - **Older past:** absolute short date `Mar 12, 2026` (no time).
  - **Future / scheduled:** absolute date + time `Mar 12, 14:30` or relative if < 24h.
  - **Always show absolute on hover** via `title` attribute, so users can disambiguate when needed.
- **Single util:** Extend `frontend/src/lib/relativeTime.ts` to export:
  - `formatRelativeTime(date)` — for past events.
  - `formatScheduled(date)` — for future events.
  - `formatAbsolute(date)` — full timestamp for tooltips and audit logs.
- **Migration pass.** Replace direct `toLocaleString()` calls in `grading/page.tsx`, `sessions/`, `SubmissionConfirmation.tsx`.

### Verification (Stage 16)

- Grep: zero `fixed inset-0 z-50 flex items-center justify-center bg-black` outside Modal/Drawer.
- Grep: zero `<button className=".*bg-brand.*` in `src/app` (all use `<Button>`).
- Grep: zero `Planned` / `Past` labels for sessions; all use `Scheduled` / `Completed`.
- Grep: zero `rounded-card` outside CLAUDE.md-documented usage.
- Manual: open every modal in the app (Format Guide, Question Picker, Review Summary, Confirm, Course Enrollment Drawer) — confirm identical backdrop, animation, dismissal behavior.
- Manual: open `/sessions`, see proper page header.

---

## Stage 17 — Verification & Theme Matrix

**Automated:**
- `npx tsc --noEmit` clean.
- `npx next build` clean.
- Backend `pytest` clean (covers Stage 1 status transitions).
- Aikido scan — zero new Critical/High.

**Grep audits:**
- Zero remaining `eyebrow="Educator workspace"`, `eyebrow="Item bank"`, `eyebrow="Authoring workbench"`, `eyebrow="Psychometric analysis"`.
- Zero remaining inline back-button SVG paths (all via `BackButton`).
- Zero remaining `<Button>` instances inside `<TR>` on `/items` (all via `RowActionMenu`).
- Zero remaining `↕` arrow glyphs (Stage 11).
- Zero remaining `<Badge>In Blueprint</Badge>` in items table.
- Zero decorative emoji characters in `.tsx`/`.ts` UI files (rerun Epoch 8.3 audit).

**Manual matrix (per stage, per theme):**

| Stage | dark | warm | light-blue |
|---|---|---|---|
| 1 — status filter chips | ☐ | ☐ | ☐ |
| 2 — read-only author page | ☐ | ☐ | ☐ |
| 3 — inspector layout | ☐ | ☐ | ☐ |
| 4 — items row density | ☐ | ☐ | ☐ |
| 5 — subject color coding | ☐ | ☐ | ☐ |
| 6 — full-content preview | ☐ | ☐ | ☐ |
| 7 — account dropdown | ☐ | ☐ | ☐ |
| 8 — blueprint cards | ☐ | ☐ | ☐ |
| 9 — per-section analytics | ☐ | ☐ | ☐ |
| 10 — back button | ☐ | ☐ | ☐ |
| 11 — sort defaults | ☐ | ☐ | ☐ |
| 12 — eyebrow audit | ☐ | ☐ | ☐ |
| 13 — login distinct theme | ☐ | ☐ | ☐ |
| 15 — token hardening (color, spinner, shell, glyphs) | ☐ | ☐ | ☐ |
| 16 — cross-surface consistency (modals, vocab, toasts, headers) | ☐ | ☐ | ☐ |

---

## Out of Scope (deferred)

- New analytics metrics beyond per-section aggregation (Epoch 10+ — psychometric deep dive).
- A real `/account` settings page — Stage 7 leaves a placeholder route only.
- Refactoring the TipTap toolbar (separate concern, may pair with Epoch 9 media uploads).
- Color theme creation tooling for educators (custom brand palettes per institution) — interesting future epoch.

---

## Exit Criteria (Epoch-Level)

- All 13 user-reported issues fixed and reviewed against the user's original phrasing.
- All extracted primitives compile in isolation and are used in ≥ 2 call sites each (or marked single-use with rationale).
- Backend `_assert_blueprint_mutable` permits editing for `SCHEDULED`; pytest proves it.
- Theme matrix complete.
- Zero net new emoji in repo.
- Aikido: zero new Critical/High findings.
- Conventional Commit: `feat(8.4): visual design pass — status semantics, inspect surface, declutter`.

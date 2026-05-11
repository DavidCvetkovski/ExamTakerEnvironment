# Epoch 8.3 — UX Audit: Library, Blueprints & Navigation Coherence

> **Status:** Planned
> **Branch:** `feature/epoch-8-3-ux-audit`
> **Scope:** Frontend-only (14 stages). No backend changes. No DB migrations.

---

## Context

Epoch 8.2 shipped the auth-aware home page, login redesign, and scroll-hardening. During sustained live use of that build, 13 concrete UX issues were identified spanning the question library, blueprint management, navigation coherence, and visual consistency. This epoch resolves all of them in staged, independently revertable commits.

No new product surface is added. Every stage is a targeted fix or missing-but-expected feature.

---

## Issues Addressed

| # | Area | Issue |
|---|------|-------|
| 1 | Warm Theme | White strip/flash appears when scrolling in the warm theme |
| 2 | Global | Emojis used throughout the UI — should be text or icon-based |
| 3 | Admin Dashboard | First two cards are light, last two are dark; hover animations are rigid |
| 4 | Grading | "What if has a mouthful of a name" cut score — rename + real-time slider reactivity |
| 5 | Grading | Sort control in grading dashboard is unintuitive and looks nothing like a sort |
| 6 | Question Library | No column-header sort; missing First Created column; previews too short; "Actions" header noise; no Copy ID button |
| 7 | Question Library | Questions used in blueprints can still be edited/deleted — must be locked; no Duplicate action |
| 8 | Blueprints | Names truncated to one line; "Locked" should be "In Use"; locked blueprints can't be inspected or practised |
| 9 | Import | Navigating away from import tab resets the entire view |
| 10 | Select Question | No ID search; "Details" label is off-centre and unintuitive |
| 11 | Blueprints | No validation: blueprints can be saved with no title or empty sections |
| 12 | Navigation | Back-to-Library / Back-to-Blueprints button is in an inconsistent position; no confirmation on discard |
| 13 | Practice Exam | Completion screen says "back to blueprints" but navigates to sessions |

---

## Engineering Principles (per CLAUDE.md)

- **Security:** No new API calls without existing auth guards. Question-lock state is derived from backend data already loaded in the blueprint store — no client-side trust.
- **Maintainability:** Each stage is a single-concern commit. Labels are string constants in one place. Validation logic lives in a single `validateBlueprint` helper shared between the manual editor and the import preview.
- **Modularity:** Column-sort state for the question library lives in `useItemStore`; import view state lives in `useImportStore`; blueprint-usage membership is a derived selector. No cross-store dependencies are introduced.
- **Scalability:** Column sort is client-side (the library already loads all questions in view). The question-lock check is a Set lookup — O(1) per question. No new polling or subscription introduced.
- **Ease of change:** Every "status" label (e.g. "In Use") is a single constant. Validation rules are expressed as an array of `{ check: () => boolean, message: string }` objects — adding a new rule is one array entry.

---

## Stage 1 — Warm-Theme Scroll Background Leak

**Files:** `frontend/src/app/globals.css`, `frontend/src/app/layout.tsx`, affected page files

**Problem:** When scrolling in the warm theme, a white band appears — either from a `background-color: white` on the `<body>` or a page-level wrapper that doesn't receive the theme background token.

**Fix:**
- Audit `globals.css`: ensure the `[data-theme="warm"]` selector sets `background-color` on both `:root`/`body` and on `[data-theme="warm"]` itself using the `--color-shell-bg` token.
- In `layout.tsx`, confirm the outermost `<div>` that carries `data-theme` also carries `bg-shell-bg` so overscroll bounce areas match the shell background.
- Remove any explicit `bg-white` or `background: white` from shared layout wrappers that are not intentionally white in every theme.

**Verification:** In warm theme, scroll to the top and bottom of any long page (analytics, question library). No white strip appears. Repeat on dark and light-blue.

---

## Stage 2 — Emoji Purge

**Files:** Any `.tsx` or `.ts` file in `frontend/src/` containing emoji characters

**Problem:** Emoji characters appear in button labels, status text, toasts, and section headings. They render inconsistently across OS/browser, are inaccessible to screen readers, and conflict with the clean text-design direction.

**Approach:**
1. Run `grep -r --include="*.tsx" --include="*.ts" -P "[\x{1F000}-\x{1FFFF}]|[\x{2600}-\x{26FF}]|[\x{2700}-\x{27BF}]"` to find all occurrences.
2. For each emoji, replace with one of:
   - **Text only** if the surrounding label is already self-explanatory (e.g., "Save" not "Save ✅").
   - **An existing Lucide icon** (already a project dependency) when a visual anchor genuinely helps scanability — wrap it in an `<span aria-hidden="true">` and keep the text label alongside.
3. Never introduce new emoji in this epoch or future epochs.

**Verification:** `grep` for emoji codepoint ranges returns zero results across `frontend/src/`.

---

## Stage 3 — Admin Dashboard Card Polish

**Files:** `frontend/src/app/admin/page.tsx` (or wherever the admin landing card grid lives)

**Problem:** The first two quick-action cards use a light background variant and the last two use a dark variant — giving the impression there is a meaningful distinction that does not exist. Hover animations use `scale(1.02)` which feels mechanical.

**Fix:**
1. **Unify card visual weight.** All four cards use the same `Card` primitive with identical background, border, and text tokens. Remove any conditional class logic that applies different backgrounds to odd/even cards.
2. **Hover animation.** Replace `hover:scale-[1.02]` with a `transition-all duration-200` that combines `hover:-translate-y-1` and `hover:shadow-lg` (token-bound shadow). This feels softer and is more consistent with the rest of the UI primitives.
3. **Confirm no semantic distinction exists** between the four cards. If a distinction is intentional (e.g., "primary vs secondary"), introduce it explicitly with a prop on the `Card` primitive and document the intent — do not infer it from background colour alone.

**Verification:** Admin landing page — all four cards look visually identical at rest. Hover produces a smooth lift. Test on all three themes.

---

## Stage 4 — Cut Score: Rename + Per-Millisecond Reactivity

**Files:** `frontend/src/app/analytics/[sessionId]/page.tsx` (or equivalent grading/analytics component containing the cut-score slider)

**Problem:** The cut-score input field is labelled with a long descriptive phrase. The displayed percentage only updates on `onChange` (mouse-up / commit event), so dragging feels unresponsive.

**Fix:**
1. **Rename** the label to `"Cut Score %"` — short and unambiguous.
2. **Real-time update:** change the slider's event handler binding from `onChange` to `onInput`. In React, `onChange` on a range input fires on every change (unlike the DOM `change` event), but confirm the state update path has no debounce or throttle wrapping it. If there is a debounce (e.g., to avoid re-running cut-score analytics on every pixel), split the state into:
   - `displayCutScore` — raw slider value, updated `onInput`, controls the visual number.
   - `committedCutScore` — debounced (300 ms) value that triggers the actual analytics re-computation.
3. The user sees the number update on every pixel of drag; the heavy computation fires 300 ms after the drag stops.

**Verification:** Drag the cut-score slider quickly. The displayed percentage updates with zero perceptible lag. Analytics re-computation does not fire on every frame (verify via network tab — requests are throttled).

---

## Stage 5 — Grading Dashboard Sort Redesign

**Files:** `frontend/src/app/grading/[sessionId]/page.tsx` (or the `GradingDashboard` component)

**Problem:** The current sort control is a custom element that does not look or feel like a sort. Users cannot tell what it does or what state it is in.

**Fix:**
- Remove the existing sort control.
- Make the relevant column headers in the grading table clickable. Each header cycles through: unsorted → ascending → descending → unsorted.
- Show a sort direction icon (up-arrow / down-arrow from Lucide) next to the active header, with a muted icon for the other sortable headers to hint they are sortable.
- Sort state lives in local component state (no store needed — it is ephemeral presentation state).
- Sortable columns: Student Name, Score, Status, Submitted At.

**Verification:** Click a column header — table sorts. Click again — reverses. Click a third time — resets to original order. The active column header is visually distinct.

---

## Stage 6 — Question Library: Column Sort + Enhancements

**Files:** `frontend/src/app/items/page.tsx`, `frontend/src/stores/useItemStore.ts`

**Six sub-tasks, each a targeted change:**

### 6a — Column-Header Sort
- Add `sortKey` and `sortDir` fields to `useItemStore` (or local component state).
- Sortable columns: Preview (by stem text alphabetically), Subject, Points, Last Edited, First Created.
- Clicking a header cycles unsorted → asc → desc → unsorted. Active column shows direction arrow via Lucide icon. Unsorted state shows a neutral chevron (muted) on hover.

### 6b — First Created Column
- The `LearningObject` model already has a `created_at` field. Expose it in the list response if not already present.
- Add a "First Created" column between "Last Edited" and the action buttons, formatted with `Intl.RelativeTimeFormat` (same pattern as Last Edited).

### 6c — Longer Previews
- Extend question stem preview from `line-clamp-1` (or `truncate`) to `line-clamp-2` so at least two lines of the question stem are visible. The row height increases proportionally.

### 6d — Remove "Actions" Column Header
- The column header currently reads "Actions" above the Edit button(s). Remove this label — the presence of icon buttons is self-explanatory. The column header cell becomes empty (no text, no border — just the cell for layout).

### 6e — Copy Question ID Button
- Add a "Copy ID" icon button (Lucide `Clipboard` icon) in the actions cell of each row.
- On click: `navigator.clipboard.writeText(question.id)` + show a brief Toast "ID copied".
- Same button appears in the top-right area of the question author/edit page.

### 6f — Search by Question ID
- The existing search input in the question library already filters by stem text. Extend it: if the input value matches a UUID pattern (`/^[0-9a-f-]{36}$/i`), filter by exact ID match instead of text search.
- Add a hint label beneath the search input: "Search by question text or paste a Question ID."

**Verification:** All six sub-tasks independently testable. Sort cycles correctly. First Created column appears and sorts correctly. Row height is taller. "Actions" header is gone. Copy ID toasts. ID search returns the correct single result.

---

## Stage 7 — Question Lock + Duplicate

**Files:** `frontend/src/app/items/page.tsx`, `frontend/src/stores/useItemStore.ts`, `frontend/src/app/author/[id]/page.tsx`, `frontend/src/stores/useBlueprintStore.ts`

**Problem:** Questions currently referenced by a blueprint can be freely edited or deleted, potentially invalidating a live exam. No duplicate action exists.

### 7a — Deriving the Locked Set
- `useBlueprintStore` already loads blueprint data including the question IDs in each block.
- Add a derived selector `lockedQuestionIds: Set<string>` that unions all question IDs across all non-draft blueprints. This is a pure computation — no new API call.
- Alternatively: the question list API can return an `in_use: boolean` flag per item. Either approach is acceptable; prefer the client-side derivation first to avoid a backend change.

### 7b — Lock Enforcement in Question Library
- If `lockedQuestionIds.has(question.id)`:
  - The Edit button is replaced by a "View" button (read-only).
  - The Delete button is hidden entirely.
  - A `Badge` with label "In Blueprint" (using the info/neutral tone) appears in the row.
- This is display-only enforcement. The backend immutability guard (already in place from Epoch 8.1 for blueprint-level locking) is the authoritative gate.

### 7c — Lock Enforcement on the Author Page
- On `/author/[id]`, if the question is in `lockedQuestionIds`, show a read-only notice at the top ("This question is used in a blueprint and cannot be edited.") and disable all editor inputs and the Save button.

### 7d — Duplicate Action
- Add a Duplicate icon button (Lucide `Copy`) in the actions column of every question row (locked and unlocked).
- On click: POST to the existing item creation endpoint with the current question's data (stem, type, options, metadata) and a `(Copy)` suffix on the stem.
- On success: toast "Question duplicated" + the new question appears at the top of the list (optimistic insert or refetch).
- Also add a "Duplicate" button on the author page toolbar, positioned next to Save.

**Verification:** Edit/Delete are disabled for locked questions. Duplicate creates a new unlocked question. Locked badge appears. Author page shows read-only notice for locked questions.

---

## Stage 8 — Blueprint Name Wrapping + Locked Blueprint UX

**Files:** `frontend/src/components/blueprint/BlueprintCard.tsx` (or equivalent), `frontend/src/app/blueprints/page.tsx`, `frontend/src/app/blueprint/page.tsx`

**Three sub-tasks:**

### 8a — Two-Line Blueprint Names
- Remove `truncate` / `line-clamp-1` from the blueprint card title. Apply `line-clamp-2` so names up to two lines render fully. Card height adjusts gracefully.

### 8b — "Locked" → "In Use"
- Find every instance of the "Locked" label in blueprint status badges, tooltips, and empty states. Replace with "In Use".
- The underlying enum value in the store/API can stay as-is; only the display string changes. Use a single `BLUEPRINT_STATUS_LABELS` map constant so the change is in one place.

### 8c — Inspect + Practice on "In Use" Blueprints
- Currently, "In Use" (locked) blueprints show no interactive options beyond "Duplicate".
- Add two buttons to the "In Use" blueprint card: "Inspect" and "Practice".
  - **Inspect:** Opens the blueprint editor in full read-only mode. All inputs are `disabled`. A banner at the top reads "This blueprint is in use and cannot be edited."
  - **Practice:** Calls the existing practice/instantiate flow. No gate needed — practising a locked blueprint is safe and desirable (it's how you verify it works before an exam).
- The edit icon/button remains hidden on "In Use" blueprints.

**Verification:** "In Use" badge appears instead of "Locked". Two-line names render without overflow. Inspect opens a read-only editor. Practice starts a practice session from a locked blueprint.

---

## Stage 9 — Import Tab State Persistence

**Files:** `frontend/src/stores/useImportStore.ts`, `frontend/src/app/blueprints/page.tsx` (or wherever the import section is rendered)

**Problem:** Navigating away from the import section (e.g., clicking Sessions, then back to Blueprints) resets the import view to its initial state, discarding any in-progress paste.

**Fix:**
- `useImportStore` is a Zustand store that already persists for the session lifetime. The reset is happening because the import section component calls a `reset()` action on mount.
- Remove (or conditionalize) the on-mount reset. Instead:
  - Only reset when the user explicitly clicks "Clear" or "Start Over".
  - Preserve: `rawText`, `parseResult`, `activeTab` (if the import has tabs), `selectedBankId`, `createBlueprint` toggle.
- Because `useImportStore` is already a module-level singleton, the state will survive unmount/remount of the import component as long as the page route does not reload. No `localStorage` persistence is needed.

**Verification:** Paste text into the import textarea → click Sessions → click Blueprints → import section shows the previously entered text and parse result. Clicking "Clear" resets the view.

---

## Stage 10 — Select Question: ID Search + Details Label Fix

**Files:** `frontend/src/components/blueprint/QuestionPickerModal.tsx` (or equivalent)

**Two sub-tasks:**

### 10a — Search by Question ID
- The existing search input in the question picker already filters by stem text.
- Extend the filter: if input matches a UUID pattern, filter by exact `id` match.
- Add a small hint below the input: "Search by question text or paste a Question ID."

### 10b — "Details" Label Fix
- The "Details" expand/toggle control for previewing a question is visually off-centre and semantically unclear.
- Replace "Details" with "Preview" — this is the universally understood word for "see more without selecting."
- Centre the label relative to its cell. If it is an icon-only button, add a `title` tooltip "Preview question".

**Verification:** Pasting a valid question UUID into the picker search returns only that question. "Details" label is gone — replaced by "Preview" and correctly aligned.

---

## Stage 11 — Blueprint Validation: Title + No Empty Sections

**Files:** `frontend/src/app/blueprint/page.tsx`, `frontend/src/stores/useBlueprintStore.ts`, `frontend/src/components/import/ImportCommitPanel.tsx` (or equivalent)

**Problem:** A blueprint can be saved with no title or with sections that contain zero questions, producing unusable blueprints that will silently fail on practice/exam.

### 11a — Validation Helper
Create a pure function `validateBlueprint(blueprint): { valid: boolean; errors: string[] }`:
```ts
const rules = [
  { check: (b) => !!b.title?.trim(), message: 'Blueprint must have a title.' },
  {
    check: (b) => b.blocks?.every((block) => block.rules?.length > 0),
    message: 'All sections must contain at least one question rule.',
  },
];
```
Place this in `frontend/src/lib/validateBlueprint.ts` — a pure util with zero imports from stores or components.

### 11b — Manual Blueprint Editor
- Call `validateBlueprint` before allowing Save. If invalid, block the save action and show inline error messages:
  - No title → highlight the title input with a red border and an error label beneath it.
  - Empty section → highlight the offending section with a red outline and an error message "Add at least one question to this section."
- The Save button remains enabled (so the user can attempt), but the action is blocked with an inline error rather than a toast — toasts disappear; inline errors persist until fixed.

### 11c — Import Commit
- Call `validateBlueprint` on the assembled import preview before enabling the Commit button when "create blueprint" is toggled on.
- If invalid: show errors in the import error panel (same panel used for parse errors).

**Verification:** Save a blueprint with no title → inline error appears on title input. Save a blueprint with an empty section → that section is outlined in red. Import with create-blueprint toggled on and a blank title → Commit button disabled + error shown.

---

## Stage 12 — Back Navigation Standardisation + Confirmation

**Files:** Import page/section component, Blueprint editor page, Author/item page

**Problem:** "Back to Library" / "Back to Blueprints" buttons appear in inconsistent positions (sometimes adjacent to action buttons, sometimes missing). There is no discard confirmation on unsaved changes.

### 12a — Canonical Back Button Position
- All detail pages (blueprint editor, question author, import detail) place a `<Button variant="ghost" size="sm">` with a `ChevronLeft` icon in the **top-left** of the page content area, before the page title. This is the universal convention.
- Remove any "Back" buttons currently placed beside primary action buttons (e.g., next to the Import button in the import section).

### 12b — Origin-Aware Destination
- Track the entry point in the URL search params or in a lightweight Zustand navigation field:
  - If the user reached the import section from the Question Library → "Back to Question Library" navigates to `/items`.
  - If reached from Blueprints → "Back to Blueprints" navigates to `/blueprints`.
- Default fallback: if no origin is tracked, navigate to the most-likely page based on the current route context.

### 12c — Discard Confirmation
- Reuse the existing `useConfirm` hook (introduced in Epoch 8.1) wherever a back navigation would discard unsaved state:
  - Blueprint editor: if `isDirty`.
  - Question author: if `isDirty`.
  - Import section: if `rawText` is non-empty and unparsed/uncommitted.
- Confirmation copy: "You have unsaved changes. Leave anyway?" with Cancel / Leave buttons.

**Verification:** Back button is in the top-left on all three pages. Clicking back from a dirty blueprint editor shows confirmation. Origin-aware destination tested: enter blueprint editor from Library vs Blueprints — back button label and destination differ.

---

## Stage 13 — Practice Exam Completion Destination Fix

**Files:** `frontend/src/components/exam/PracticeCompletionScreen.tsx`, any other component that sets the post-practice navigation target

**Problem:** The practice exam completion screen's "Done" / "Back" action displays copy referencing Blueprints but navigates to `/sessions`.

**Fix:**
- Decide on the canonical post-practice destination: **Blueprints** (`/blueprints`). Practice is accessed from a blueprint, so it is coherent to return there.
- Update the navigation call: `router.push('/blueprints')`.
- Update any associated copy: "Return to Blueprints" or "Back to Blueprints".
- If the `mode` prop or session context indicates the practice was launched from a specific blueprint, navigate to `/blueprints?highlight={blueprintId}` to return the user to exactly that blueprint in the list.

**Verification:** Complete a practice exam. Click the completion screen's back/done action. Browser navigates to `/blueprints`. Copy on the completion screen matches the destination.

---

## Stage 14 — Verification

### Type & Build
```bash
npx tsc --noEmit       # zero errors
npx next build         # compiles cleanly
```

### Grep Audits
```bash
# Zero emoji in UI source
grep -r --include="*.tsx" --include="*.ts" -P "[\x{1F000}-\x{1FFFF}]|[\x{2600}-\x{26FF}]|[\x{2700}-\x{27BF}]" frontend/src/

# Zero "Locked" blueprint status labels
grep -r '"Locked"' frontend/src/

# Zero "Actions" column header
grep -r '>Actions<' frontend/src/

# Zero hardcoded "Cut score" long label
grep -ri "mouthful\|what if" frontend/src/
```

### Manual Verification Matrix

| Check | Dark | Warm | Light-Blue |
|-------|------|------|------------|
| Warm-theme scroll — no white strip | — | ✓ | — |
| Admin cards — uniform appearance, smooth hover | ✓ | ✓ | ✓ |
| Cut Score % slider — per-pixel reactivity | ✓ | ✓ | ✓ |
| Grading sort — column-header sort arrows | ✓ | ✓ | ✓ |
| Question library — column sort, First Created, 2-line preview | ✓ | ✓ | ✓ |
| Locked question — Edit replaced by View, Delete hidden | ✓ | ✓ | ✓ |
| Duplicate question — creates copy, toast shown | ✓ | ✓ | ✓ |
| Blueprint names — two lines rendered without overflow | ✓ | ✓ | ✓ |
| "In Use" badge replaces "Locked" | ✓ | ✓ | ✓ |
| Inspect + Practice buttons on "In Use" blueprints | ✓ | ✓ | ✓ |
| Import text preserved after nav away and back | ✓ | ✓ | ✓ |
| Question picker — UUID search returns single result | ✓ | ✓ | ✓ |
| "Preview" replaces "Details" in picker | ✓ | ✓ | ✓ |
| Blueprint save blocked with no title — inline error | ✓ | ✓ | ✓ |
| Blueprint save blocked with empty section — inline error | ✓ | ✓ | ✓ |
| Back button in top-left on all detail pages | ✓ | ✓ | ✓ |
| Discard confirmation on dirty blueprint back-nav | ✓ | ✓ | ✓ |
| Practice completion navigates to /blueprints | ✓ | ✓ | ✓ |

### Aikido Scan
- Zero new Critical/High findings.

---

## Exit Criteria

All 14 stages complete with the following verified:

- `npx tsc --noEmit` + `npx next build` pass with zero errors.
- Zero emoji characters in any `.tsx`/`.ts` UI file (grep clean).
- Zero "Locked" blueprint status labels in rendered UI (grep clean).
- Zero "Actions" column header in question library (grep clean).
- All 18 rows of the manual verification matrix checked on at least the dark and warm themes.
- Aikido scan: zero new Critical/High findings.
- Merged to `main` via PR from `feature/epoch-8-3-ux-audit`.

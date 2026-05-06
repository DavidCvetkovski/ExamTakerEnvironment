# Epoch 7.7 Blueprint — UX Bugs, Authoring Save Flow & Date/Time Pickers ✅

> **Branch:** `feature/epoch-7-7-ux-fixes`
> **Prerequisites:** Epoch 7.6 (visual polish & component primitives) merged to `main`.
> **Reference:** `directives/epoch_7_6_blueprint.md`, `CLAUDE.md`.
> **Status:** ✅ Complete — all 6 implementation stages done, pushed to remote.

## Implementation Status

| Stage | Description | Status |
|---|---|---|
| 1 | Theme Toggle UX (click-outside, escape, route-change, drop themeNotice) | ✅ |
| 2 | Light-theme contrast (warm borders, opacity bumps, amber/cyan hardcode removal) | ✅ |
| 3 | Analytics bugs (histogram solid, slider smooth, Drill down primitive, dedupe Inspect) | ✅ |
| 4 | Library columns (remove Status, add Last edited with relative time, sort desc) | ✅ |
| 5 | Toast primitive + authoring explicit save flow (serverSnapshot, isDirty, revert, beforeunload) | ✅ |
| 6 | DatePicker + TimePicker primitives, SessionCreateForm date/time UX (now+1m default) | ✅ |
| 7 | Verification (tsc + next build green, sanity greps clean) | ✅ |

### New files
- `src/hooks/useClickOutside.ts` — reusable click-outside hook (callbackRef pattern, no re-registration bug)
- `src/components/ui/Toast.tsx` — ToastProvider portal, 4s auto-dismiss, tone-aware
- `src/components/ui/useToast.ts` — Zustand-backed toast store + useToast hook
- `src/components/ui/DatePicker.tsx` — calendar popover, month/year nav, min constraint, native fallback
- `src/components/ui/TimePicker.tsx` — HH/MM/AM·PM spinner columns, scroll-snap, step prop

### Key modified files
- `src/stores/useAuthStore.ts` — themeNotice fully removed
- `src/stores/useAuthoringStore.ts` — debounce gone; serverSnapshot/isDirty/revertChanges
- `src/stores/useLibraryStore.ts` — updated_at field added to LearningObjectSummary
- `src/app/author/page.tsx` — save toast, Revert button, StatusDot dirty indicator, beforeunload
- `src/app/items/page.tsx` — Status column out, Last edited in, sort by updated_at desc
- `src/app/layout.tsx` — ToastProvider mounted
- `src/components/analytics/HistogramChart.tsx` — solid brand colour, no gradient
- `src/components/analytics/CutScoreSlider.tsx` — step 0.1, live display, brand track
- `src/components/analytics/AllItemsTable.tsx` — Button ghost "Drill down →", brand active, shell-border dividers
- `src/components/analytics/FlaggedItemsTable.tsx` — Button ghost "Drill down →", "Inspect" removed
- `src/components/sessions/SessionCreateForm.tsx` — Date state, now+1m default, DatePicker+TimePicker
- `src/components/sessions/CourseEnrollmentDrawer.tsx` — amber hardcodes → Button primitive + brand tokens
- `src/components/layout/ThemeToggle.tsx` — click-outside, escape, route-change close

---

## Summary

Epoch 7.7 is a focused fix-and-finish pass. It addresses concrete UX bugs and polish issues uncovered while using the 7.6 build, and lands two larger feature improvements on top: **explicit-save with revert in the authoring workbench**, and a **proper date/time picker for session scheduling**.

Scope-wise, this epoch is **frontend-only** with one small backend touch (a `last_edited_at` field already exists on the LO; only a Pydantic / response-schema check is needed). No database migrations, no new endpoints, no new product surface beyond the picker UI and explicit-save controls.

The epoch is organised by user complaint, then grouped into stages by surface area. Every issue raised is addressed; explicit deferrals are listed under **Out of Scope**.

---

## Issues Catalogue (Ground Truth)

| # | Issue | Severity | Stage |
|---|---|---|---|
| 1 | "Theme set to light-blue" text floats free in the layout | bug | 1 |
| 2 | Theme popover does not close on outside click / route change | UX | 1 |
| 3 | Warm-theme borders on blueprint cards / blueprint sections are nearly invisible | contrast | 2 |
| 4 | "Too Easy" / "Poor Discrimination" flag tags barely readable on warm + light-blue | contrast | 2 |
| 5 | Score-distribution histogram bars use ugly gradients; do not adapt to theme | polish | 3 |
| 6 | Cut-Score What-If slider snaps in 1% increments; value only updates on release | UX | 3 |
| 7 | "Drill Down" button is layout-broken (split across two overlapping lines) | bug | 3 |
| 8 | "Drill Down" (AllItemsTable) and "Inspect" (FlaggedItemsTable) duplicate each other | redundancy | 3 |
| 9 | Question Library: `Status` column is unused noise | UX | 4 |
| 10 | Question Library: missing `Last edited` column | UX | 4 |
| 11 | Authoring workbench: no concrete save feedback when Save is clicked | UX | 5 |
| 12 | Authoring workbench: edits auto-persist; user wants explicit save only | UX / data | 5 |
| 13 | Authoring workbench: no way to revert unsaved changes | UX | 5 |
| 14 | Sessions page: "Course setup" / "Create course" titles are stuck yellow on every theme | contrast | 6 |
| 15 | SessionCreateForm: Start date/time accepts free-text typing — clunky | UX | 6 |
| 16 | SessionCreateForm: Start time should default to "now + 1 minute" | UX | 6 |
| 17 | SessionCreateForm: date and time should be separate fields with calendar pop-up | UX | 6 |

---

## Engineering Principles for This Epoch

The work touches form state, store mutations, and a popover. Three CLAUDE.md principles dominate:

- **Separation of concerns.** Picker logic lives in a dedicated `DatePicker` / `TimePicker` primitive in `components/ui/`. Toast logic lives in a `Toast` primitive + provider. No business-logic mixing into route components.
- **Modularity.** Authoring-store shape changes (explicit save, revert) introduce a clean `dirty` / `pristine` snapshot pattern that is reusable for any future form. Pickers compose like every other field — `<DatePicker value={…} onChange={…} />` — with no leaky parent-state requirements.
- **Security.** Date/time input is parsed and validated server-side already; we just upgrade the client-side UX. No new attack surface. Toast content is plain text, never `dangerouslySetInnerHTML`. Outside-click handlers use refs, no event-bubbling tricks that could be hijacked.
- **Scalability.** The Toast provider + `useToast()` hook is a centralised, theme-aware notification primitive that future epochs reuse. The `useClickOutside` hook is similarly reusable.

---

## Stage-by-Stage Plan

### Stage 1 — Theme Toggle UX (Issues #1, #2)

**Files**
- `src/components/layout/ThemeToggle.tsx`
- `src/hooks/useClickOutside.ts` *(new)*
- `src/stores/useAuthStore.ts` (drop `themeNotice` mechanism — replaced by Toast in Stage 5)

**Changes**
1. Wrap the popover trigger + panel in a `ref`-tagged container; use new `useClickOutside(ref, () => setIsOpen(false))` hook to close on outside click.
2. Close popover on `Escape` keypress (`useEffect` keydown listener while open).
3. Close popover on route change (`usePathname` effect).
4. Remove the floating `themeNotice` `<div className="sr-only">` block. The user is reporting it leaks visually — `sr-only` is failing in some context (likely Tailwind v4 + a parent flex shrink). The notice migrates to the new Toast primitive (Stage 5) so a regular sighted user gets a 2-second confirmation toast and screen readers get an `aria-live` region inside the toast.
5. The toggle button itself migrates to the `Button` primitive (`variant="secondary"`, `size="sm"`) so it inherits hover/focus styling consistent with the header.

**Exit criteria**
- Click outside popover → closes.
- `Escape` → closes.
- Navigating to a different route while popover is open → closes.
- `grep -rn "themeNotice" src/` returns zero matches.
- No floating "Theme set to …" text on any theme.

---

### Stage 2 — Light-Theme Contrast Fixes (Issues #3, #4, #14)

**Files**
- `src/app/globals.css` (token tweaks only)
- `src/app/sessions/page.tsx` and `src/components/sessions/SessionCreateForm.tsx` (find the yellow heading source — likely a hardcoded `text-amber-*` or `text-student-accent` reference outside a token branch)

**Changes**

*Tokens (warm theme):*
- `--color-shell-border: #e8dcc7` → `#d4c194` (was too close to surface; bumped towards medium-tan for visible 1px hairlines).
- `--color-shell-border-deep: #c9b48d` → `#b09767` (deeper accent for hover and bordered cards).

*Tokens (warm + light-blue) — status palette `*-fg`:*
- Warm `--color-warning-fg: #8a5a0e` is fine but the badge `--color-warning-bg` opacity is `0.10` → bump to `0.18` so the soft pill is more visible against cream.
- Same opacity bump for `--color-info-bg` and `--color-danger-bg` on warm.
- Light-blue: bump warning-bg / danger-bg opacity from `0.10` → `0.16`.
- Verify `Badge` flag tags ("Too Easy", "Poor Discrimination") render with sufficient contrast: target ≥ 4.5:1 fg-on-bg in soft variant on every theme.

*Sessions form yellow titles:*
- Find every `text-amber-*` / `text-yellow-*` / `text-student-accent` in `SessionCreateForm.tsx` and `CourseEnrollmentDrawer.tsx`. If they're "headings", migrate to `text-foreground`. If they're "label eyebrows", migrate to the `.eyebrow` utility class.
- The component should consume `<SectionHeader />` from the UI primitive layer instead of hand-rolling labels; that fixes the colour problem at the architecture level.

**Exit criteria**
- Manual: Open `/blueprint` in warm theme — every block card has a visible 1px border at rest, deeper border on hover.
- Manual: `Too Easy`, `Poor Discrimination`, `Underperforming` badges all readable on all three themes (developer eyeball check + Lighthouse Contrast).
- Sessions/course-setup headings legible across `dark` / `warm` / `light-blue`.

---

### Stage 3 — Analytics Component Bugs (Issues #5, #6, #7, #8)

**Files**
- `src/components/analytics/HistogramChart.tsx` (gradient bars → solid theme colour)
- `src/components/analytics/CutScoreSlider.tsx` (smooth slider, live updating)
- `src/components/analytics/AllItemsTable.tsx` (Drill Down button — layout fix + dedupe)
- `src/components/analytics/FlaggedItemsTable.tsx` (rename Inspect → Drill Down OR delete one of the two duplicates)

**Changes**

*Histogram (Issue #5):*
- Replace `linear-gradient(...)` fills with `var(--color-brand)` for the body of the bar and `var(--color-shell-border-deep)` for the axis.
- The peak / mean / median markers stay as is; they already use `text-shell-muted` per Stage 12.
- Verify in all three themes — the bars now naturally adapt because `--color-brand` re-tints per theme.

*Cut-Score slider (Issue #6):*
- Current implementation uses native `<input type="range" step="1">` with `onChange`. `onChange` fires on every value change in modern React, so live updates *should* already work; the snappiness is from `step="1"`. Switch to `step="0.1"` for smoothness, then `Math.round(value)` before display and before passing to the store. Display the rounded integer, but let the slider thumb interpolate freely.
- Wrap the input in a small custom-styled track using CSS variables so it themes correctly: track = `--color-shell-input-alt`, fill = `--color-brand`, thumb = `--color-shell-surface` with brand border.
- Add `aria-valuetext` so screen readers announce the rounded percentage, not the float.

*Drill Down button (Issues #7, #8):*
- Inspect both buttons:
  - `AllItemsTable.tsx:144` — "Drill Down" (broken layout, allegedly clipped/wrapping)
  - `FlaggedItemsTable.tsx:108` — "Inspect" (separate visual treatment for the same destination)
- Replace both with the `Button` primitive (`variant="ghost" size="sm"`, label `"Drill down →"`, no whitespace splitting). The primitive's `whitespace-nowrap` resolves the layout-clipping bug at the architecture level.
- Pick one canonical label: **"Drill down →"**. Both tables get the same primitive call, the same affordance, the same destination. Visual consistency is the point of the primitive layer.

**Exit criteria**
- Histogram bars are solid, theme-aware, no gradient.
- Cut-score slider feels smooth (no snap), value display updates while dragging, settles on the nearest integer when released.
- Drill-down button renders on a single line in every table at every viewport ≥ 320px.
- `grep -n "Inspect" src/components/analytics/` returns zero (confirming dedupe).

---

### Stage 4 — Question Library Columns (Issues #9, #10)

**Files**
- `src/app/items/page.tsx`
- `src/stores/useLibraryStore.ts` (verify the API response includes `updated_at`; if not, expand the read query — the backend already stores it, this is a frontend-only DTO surface)

**Changes**
1. Remove `Status` `<TH>` and the corresponding `<TD>` cell rendering the badge. Keep the underlying `latest_status` field intact in the store — it'll be used elsewhere.
2. Add `Last edited` column showing `updated_at` (or `latest_version_updated_at`, whichever the API exposes for the latest version). Format with `Intl.RelativeTimeFormat` for "2h ago" / "3d ago" friendliness; fallback to `toLocaleDateString()` past 30 days.
3. Sort default: descending by `last_edited` so most recent edits are at the top — matches the user's likely workflow.

**Backend contract check** — `LibraryItemResponse` Pydantic schema must already include the timestamp. If not, the schema is the only thing that changes; no DB migration. Document the schema audit in the stage exit criteria.

**Exit criteria**
- Library renders 6 columns: Preview, Subject, Points, Type, Last edited, Actions.
- Last-edited renders as relative time for items edited in the last 30 days.
- `grep -n "Status" src/app/items/page.tsx` returns no UI references (constants like `STATUS_TONE` may remain unused — clean up too).

---

### Stage 5 — Authoring Workbench Save Flow + Toast Primitive (Issues #11, #12, #13)

This is the most architecturally interesting stage. We're switching the authoring store from "auto-persist on every keystroke" to "buffer changes, persist on explicit Save, support Revert."

**New primitives**

- `src/components/ui/Toast.tsx` *(new)* — toast renderer + provider.
- `src/components/ui/useToast.ts` *(new)* — `useToast()` hook returning `{ toast(opts), dismiss(id) }`.
- `src/components/ui/index.ts` (re-export `Toast`, `ToastProvider`, `useToast`)
- `src/app/layout.tsx` (mount `<ToastProvider />` once, app-wide)

The Toast API:
```ts
toast({ tone: 'success' | 'info' | 'warning' | 'danger', title: string, description?: string, duration?: number });
```

Visual: top-right stack, `Card variant="elevated"`, slide-in from right via `--ease-decelerate` + `--duration-normal`, 4-second auto-dismiss, manual dismiss `×` button. Theme-aware via existing tokens. Maximum 4 visible at once; older toasts queue.

**Authoring store changes (`src/stores/useAuthoringStore.ts`)**

Today the store uses a 2-second debounced auto-save. Replace with a dirty-tracking pattern:

| State field | Meaning |
|---|---|
| `serverSnapshot` | Last known persisted version (from `fetchLatestVersion`). Read-only at the UI level. |
| `localDraft` | The in-memory draft the editor mutates. Diffs against `serverSnapshot` to compute `isDirty`. |
| `isDirty` | Boolean derived: `!isEqual(localDraft, serverSnapshot)`. |
| `saveStatus` | `IDLE` / `SAVING` / `SAVED` / `ERROR` (already exists; keep). |

Mutations:
- `updateContent`, `updateMetadataField`, `setQuestionType`, `addOption`, etc. now mutate **only** `localDraft`. **No debounce, no setTimeout, no auto-save.**
- `saveDraft()` POSTs `localDraft`, on success copies it into `serverSnapshot` (so `isDirty` becomes false), fires `toast({ tone: 'success', title: 'Question saved' })` from the calling component.
- New `revertChanges()` resets `localDraft = structuredClone(serverSnapshot)`.

Author page (`src/app/author/page.tsx`) wiring:
- Save button: `onClick={() => saveDraft().then(() => toast.success(...)).catch(() => toast.danger(...))}`.
- Revert button (new): `variant="secondary" size="md"`, disabled when `!isDirty`, `onClick={revertChanges}`.
- Add a small "Unsaved changes" indicator (`<Badge tone="warning" size="sm">` or a `StatusDot tone="warning" />`) next to the Save button when `isDirty`.
- Add `beforeunload` warning when `isDirty` is true (browser-native confirm dialog) so accidental navigation doesn't drop work.

**Why this is the right shape**
- **Maintainability**: the `serverSnapshot` / `localDraft` pattern is a textbook optimistic-UI form pattern; future forms (e.g. a blueprint-edit form that should also have explicit save) can copy it.
- **Modularity**: the Toast primitive is reused by every future epoch that needs feedback.
- **Scalability**: zero backend changes; the existing `PUT /lo/{id}/version` endpoint accepts the localDraft as-is.
- **Security**: nothing changes server-side — the backend was already validating every mutation. The change is purely "when do we send the request"; we send fewer (good), and only on explicit user intent (good for audit trails too).

**Exit criteria**
- Editing fields no longer triggers a network call. (Verify in DevTools Network tab — only see a request after Save click.)
- Clicking Save fires a success toast.
- Network failure on save shows a danger toast with the error.
- Revert button restores the last saved state and removes the dirty indicator.
- `grep -n "debounceTimer\|setTimeout.*save" src/stores/useAuthoringStore.ts` returns zero.
- Closing the browser with unsaved changes shows the native "Leave site?" confirm.

---

### Stage 6 — SessionCreateForm Date/Time Picker (Issues #15, #16, #17)

**New primitives**
- `src/components/ui/DatePicker.tsx` *(new)*
- `src/components/ui/TimePicker.tsx` *(new)*

**Implementation approach**

For a maintenance-first stack like ours, the right balance is: **build a thin wrapper around the native `<input type="date">` / `<input type="time">` for the typing affordance, but render a custom calendar / clock popover for the visual picker.** No new dependency.

The popover uses `<dialog>` semantics (no portal, no z-index hell) anchored to the field via `position: absolute` + a click-outside hook (the same `useClickOutside` from Stage 1). Calendar grid is computed in JS with `Intl.DateTimeFormat` for month / weekday names — automatic locale support, zero dependency.

API:
```tsx
<DatePicker value={Date} onChange={(d: Date) => …} min={Date} max={Date} />
<TimePicker value={Date} onChange={(d: Date) => …} step={1 | 5 | 15} /* minutes */ />
```

Both write to the same parent `Date` object so the SessionCreateForm doesn't have to merge two separate fields by hand:

```tsx
<Field label="Start date">
  <DatePicker value={startsAt} onChange={setStartsAt} min={now} />
</Field>
<Field label="Start time">
  <TimePicker value={startsAt} onChange={setStartsAt} step={5} />
</Field>
```

**SessionCreateForm changes (`src/components/sessions/SessionCreateForm.tsx`)**

1. Default `startsAt = new Date(Date.now() + 60_000)` (now + 1 minute) on first render. Reset to a fresh `now+1` whenever the form opens / clears.
2. Replace the typed Start date/time field with `<DatePicker />` + `<TimePicker />` side-by-side under one `Field` group ("Start date and time").
3. Same treatment for "End date and time" (default = start + 60 minutes; end-min constrained to `startsAt + 5 minutes`).
4. On submit, serialise to ISO `Date.toISOString()` exactly as today.

**Creative-time-picker note**: rather than a 24-row scroll-list, the TimePicker renders three small spinner columns (HH / MM / AM·PM) using arrow-up/down + scroll-wheel + arrow-keyboard. Looks more refined than the native dropdown and themes via tokens. The `step` prop quantises minute increments (default 5).

**Accessibility**
- DatePicker root has `role="group"` with `aria-label`. The trigger button has `aria-haspopup="dialog"` and `aria-expanded`. Calendar cells use `role="gridcell"` + `aria-selected`. Arrow keys navigate days. `Enter` selects. `Escape` closes.
- TimePicker spinners use `role="spinbutton"` with `aria-valuemin`/`max`/`now`/`text`.

**Why custom + native fallback**
- Custom calendar gives the "creative" UX the user asked for and themes consistently.
- We keep an invisible native `<input type="date">` mounted off-screen for typed entry / paste; the typed value is parsed and reflected into the popover. This is one of the rare places where progressive enhancement actually adds value (paste flow + screen-reader date entry).

**Exit criteria**
- Opening the create-session form pre-fills Start with `now + 1 minute`.
- Clicking the date field opens a calendar popover with month / year navigation.
- Clicking outside the popover closes it.
- Time picker snaps to 5-minute increments by default, but is overridable via prop.
- Form submission still produces the same ISO string the backend expects (smoke test against existing scheduled-session create endpoint).

---

### Stage 7 — Verification

**Files**
- `tests/e2e/theme-toggle.spec.ts` *(new, optional — Playwright)* — outside-click closes popover.
- `tests/e2e/authoring-save-flow.spec.ts` *(new, optional)* — type → no network → save → toast → revert.
- `tests/e2e/session-create-form.spec.ts` *(new, optional)* — defaults to now+1, picker opens, submission ISO is correct.

**Required automated checks**
- `npx tsc --noEmit` — passes.
- `npx next build` — passes.
- `grep -rn "themeNotice\|debounceTimer\|Inspect" src/` — returns zero (sanity gates baked into the issues catalogue).

**Required manual checks (theme × page matrix)**

| Surface | Dark | Warm | Light-blue |
|---|---|---|---|
| Theme popover open / close | ✓ | ✓ | ✓ |
| `/blueprint` block borders visible | ✓ | ✓ | ✓ |
| Analytics flag badges legible | ✓ | ✓ | ✓ |
| Histogram bars solid + themed | ✓ | ✓ | ✓ |
| Cut-score slider smooth | ✓ | ✓ | ✓ |
| Authoring save toast | ✓ | ✓ | ✓ |
| Authoring revert | ✓ | ✓ | ✓ |
| Session create date picker | ✓ | ✓ | ✓ |
| Session create time picker | ✓ | ✓ | ✓ |

---

## Out of Scope (Deferred)

These are real concerns but not landing in 7.7. Each gets a sentence on why:

- **Mobile-specific date/time picker variants.** The custom popover degrades to native on touch devices via `@media (pointer: coarse)`. A hand-tuned mobile picker is a polish task for a future mobile-focused epoch (alongside layout overhauls).
- **Recurring / repeat sessions.** Picker UI doesn't grow to RRULE here. Backlog item.
- **Internationalisation.** `Intl.DateTimeFormat` already gives us locale-aware formatting, but the broader i18n project (UI strings, RTL support) is its own epoch.
- **Toast persistence across navigations.** The Toast provider is in-memory only; if the user navigates away during a 4-second toast it dismisses on unmount. Deferred queue-across-routes is a backlog item if needed.
- **Toast severity escalation / sticky errors.** All toasts auto-dismiss in 7.7; sticky/persistent toasts (e.g. for connection loss) deferred.
- **History / undo stack in the authoring workbench beyond a single Revert.** A multi-step undo (Cmd-Z) is a future authoring epoch, not this one.
- **Audit log of save events.** Backend already records version writes via the existing endpoint; surfacing a per-LO history view is its own epoch.
- **Calendar widget drag-to-select date range.** Not needed for the single-date picker; future booking flows might add it.

---

## Test Plan (Acceptance Matrix)

| # | Criterion | Verification |
|---|---|---|
| 1 | Theme popover closes on outside click, escape, and route change | Manual / Playwright |
| 2 | No floating "Theme set to …" text on any theme | Manual on all 3 themes |
| 3 | Warm-theme borders visible at rest (1px hairline contrast ≥ 1.5:1) | Manual |
| 4 | Status badges meet WCAG-AA contrast on warm + light-blue | Manual + contrast checker |
| 5 | Histogram bars solid, theme-adaptive | Manual screenshot diff |
| 6 | Cut-score slider updates value live while dragging; settles on integer | Manual |
| 7 | Drill-down button single-line at ≥ 320px viewport | Manual + responsive devtools |
| 8 | One canonical "Drill down" button across analytics — no "Inspect" | `grep` + manual |
| 9 | Library: no Status column; Last-edited column present | Manual |
| 10 | Authoring: zero network requests during typing | DevTools Network |
| 11 | Authoring Save → success toast | Manual |
| 12 | Authoring Revert → state reset to last save | Manual |
| 13 | Browser close with unsaved changes prompts | Manual |
| 14 | Sessions form: Start = now + 1m on first open | Manual |
| 15 | Calendar popover opens, navigates, picks dates, closes on outside click | Manual |
| 16 | Form submit produces backend-compatible ISO string | Manual + backend log inspection |
| 17 | `npx tsc --noEmit` exits 0 | CI |
| 18 | `npx next build` exits 0 | CI |
| 19 | Aikido scan: zero new Critical/High findings | CI |

---

## File Inventory

### New files
- `src/hooks/useClickOutside.ts`
- `src/components/ui/Toast.tsx`
- `src/components/ui/useToast.ts`
- `src/components/ui/DatePicker.tsx`
- `src/components/ui/TimePicker.tsx`

### Modified files
- `src/components/layout/ThemeToggle.tsx` (popover behaviour, drop themeNotice, primitive Button)
- `src/stores/useAuthStore.ts` (drop themeNotice mechanism)
- `src/app/globals.css` (warm border tokens, opacity bumps on warm/light-blue status backgrounds)
- `src/app/layout.tsx` (mount `<ToastProvider />`)
- `src/components/ui/index.ts` (re-export new primitives)
- `src/components/analytics/HistogramChart.tsx` (gradient → solid)
- `src/components/analytics/CutScoreSlider.tsx` (smooth + live update + theme-aware)
- `src/components/analytics/AllItemsTable.tsx` (Drill-down primitive)
- `src/components/analytics/FlaggedItemsTable.tsx` (rename Inspect → Drill down primitive)
- `src/app/items/page.tsx` (Status column out, Last edited column in, default sort)
- `src/stores/useLibraryStore.ts` (audit DTO for `updated_at`)
- `src/stores/useAuthoringStore.ts` (debounce → explicit save + revert + dirty tracking)
- `src/app/author/page.tsx` (Save toast, Revert button, dirty indicator, beforeunload)
- `src/components/sessions/SessionCreateForm.tsx` (date/time pickers, default now+1m)
- `src/app/sessions/page.tsx` & `src/components/sessions/CourseEnrollmentDrawer.tsx` (yellow heading fix → SectionHeader primitive)

### Unchanged (verification only)
- All backend code. Optional one-line audit of `LibraryItemResponse` Pydantic schema for `updated_at` exposure.
- Database schema, migrations, endpoints.

---

## Assumptions and Defaults (Locked)

- The `last_edited_at` (or equivalent) field is already returned by the LO list endpoint. If it isn't, we add it to the existing Pydantic response schema only — no DB migration.
- Native `<input type="date">` and `<input type="time">` remain mounted (visually hidden) under the custom picker for paste/typing accessibility. We do not ship without this fallback.
- Toast queue is in-memory and per-tab. Persistence across reloads is out of scope.
- Pickers default to the user's locale via `Intl.DateTimeFormat` — no manual locale selector in 7.7.
- The Toast primitive renders into a fixed-position container appended to the document body; uses no new dependency, no React portal beyond `createPortal` (already in `react-dom`).
- The authoring store's `localDraft` is held in Zustand, not in component state. This keeps the dirty / pristine comparison reactive across components without prop-drilling.
- We use `structuredClone()` (Node 17+, all evergreen browsers) for snapshot copies. Acceptable since Next.js 16 already requires modern runtimes.

# Epoch 7.9 Blueprint — Light-Theme Hardening, Authoring/Library Persistence, Grading Reform, Student Grades Tab & Polish

> **Branch:** `feature/epoch-7-9-polish`
> **Prerequisites:** Epoch 7.8 merged to `main`.
> **Scope:** Frontend-first. Two backend touches: (a) collapse `AUTO_GRADED` into `FULLY_GRADED` when no manual grading is pending; (b) extend `/student/sessions/` payload with `existing_attempt_status`. No DB migrations. No new product surface.
> **CLAUDE.md principles in play:** Separation of concerns, type safety, modularity (one new UI primitive, one new domain page), security (server-side validation on durations), no dead code (delete unused branching), maintainability (token-only colour usage on every audited page).

---

## Progress Checklist

- [ ] Stage 1 — Light-Theme Tag & Token Audit (DistractorBars, blueprint placeholders, editor headings, blueprint page migration)
- [ ] Stage 2 — Authoring Bench Toolbar Polish (drop "Status: Ready", prevent button reflow on dirty)
- [ ] Stage 3 — QuestionPickerModal Detail Cleanup (drop Status row, wrap long content)
- [ ] Stage 4 — Library / Authoring Persistence (`lastEditingLoId` mirror of blueprint pattern)
- [ ] Stage 5 — Analytics Information & Cleanup (new `InfoTooltip` primitive, drop Version column from flagged items, fix ugly UUID display)
- [ ] Stage 6 — Grading Status Reform (`AUTO_GRADED` → `FULLY_GRADED` when pending_manual == 0)
- [ ] Stage 7 — Student "My Grades" Tab (new nav, new page, surface pending-grading sessions)
- [ ] Stage 8 — Blueprint Publish/Practice UX & Validation (toasts, duration ≥ 1, button primitives)
- [ ] Stage 9 — Resume vs. Already-Submitted Distinction (`existing_attempt_status` + `StudentExamCard` states)
- [ ] Stage 10 — Toast Hydration Fix (mounted-flag pattern in `ToastProvider`)
- [ ] Stage 11 — Verification (tsc, next build, theme matrix, hydration-error gone)

---

## Issues Catalogue

| # | Issue | Stage |
|---|---|---|
| 1 | DistractorBars "Non-functional" / "Correct" tags barely visible in light theme | 1 |
| 2 | Blueprint placeholder text invisible in light themes (`placeholder-white/20`, `placeholder-white/10`) | 1 |
| 3 | Editor H2 (and H1, H3) makes text invisible in light themes (hardcoded `color: white`) | 1 |
| 4 | Blueprint page is full of `bg-white/[0.0X]`, `border-white/Y`, `bg-blue-500/20 text-blue-400`, raw `<button>` with hardcoded greens/blues — not theme-aware | 1 / 8 |
| 5 | Authoring bench shows "Status: Ready" eyebrow that adds noise | 2 |
| 6 | When dirty, "Unsaved changes" text pushes Save button onto next row — ugly reflow | 2 |
| 7 | Status field in QuestionPickerModal "deep inspect" view is noise | 3 |
| 8 | In QuestionPickerModal inspect view, long content forces horizontal scroll | 3 |
| 9 | Switching tabs while editing a question (Library → Blueprints → Library) loses progress; user is dumped on the list, not back into the editor | 4 |
| 10 | Analytics metrics (Mean, Median, Std Dev, Cronbach's α, SEM, P-value, D-value, distractor) are unfamiliar to most educators — no in-page explanation | 5 |
| 11 | Item analytics page shows an ugly raw UUID line: `Learning Object 7040243f-2faf-497e-b1a3-b506d76d3ab1` | 5 |
| 12 | Flagged items table still shows a "Version" column | 5 |
| 13 | Auto-graded sessions don't count as "Fully graded" in the dashboard, even when no manual grading is needed | 6 |
| 14 | Student has no separate place to view their grades — they're crammed into the bottom of `/my-exams` | 7 |
| 15 | Publishing a blueprint provides no visible feedback (no toast, no animation) | 8 |
| 16 | Publishing a blueprint with duration = 0, empty, or negative gets caught only by the backend with a generic error | 8 |
| 17 | Practising a blueprint with the same invalid duration likewise produces a generic error | 8 |
| 18 | Blueprint title uses a hardcoded blue→indigo gradient (`from-blue-400 to-indigo-500`) ignoring theme | 8 |
| 19 | Publish Blueprint / Practice Blueprint buttons hardcoded `bg-green-500`, `bg-blue-600` — not theme-aware | 8 |
| 20 | "Resume exam" button shown for sessions the student has already submitted — clicking yields a confusing failure | 9 |
| 21 | `ToastProvider` triggers a hydration mismatch error on `/my-exams` (and any SSR-rendered page) | 10 |

(21 catalogued issues. Bonus polish work in §"Side polish" — included where adjacent to a stage.)

---

## Side polish (folded into adjacent stages)

These are small fixes spotted while planning; each is < 5 minutes and gets bundled into the stage that touches the same file.

- **Stage 1:** Sort-button inline `style={{ backgroundColor: 'var(--color-brand)' }}` in `FlaggedItemsTable.tsx` and `AllItemsTable.tsx` → replace with `bg-brand text-white` Tailwind class.
- **Stage 1:** Blueprint Shuffle toggle switches are raw buttons. Wrap with a tiny `Toggle` primitive (or migrate to existing pattern) so the dot is themed.
- **Stage 5:** `StatCard accent` API in `components/analytics/StatCard.tsx` is a shim. Once the info-tooltip lands the shim should accept tooltip-text via `info` prop without breaking existing call sites.
- **Stage 8:** Replace `bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500` blueprint title with token-bound foreground.
- **Stage 8:** Empty / `0`-pixel error state on duration input — visible inline error, not just a backend 422 toast.

---

## Stage 1 — Light-Theme Tag & Token Audit

**Goal:** No raw `bg-white/X`, `text-white`, `placeholder-white`, `bg-blue-500/N`, `bg-emerald-N`, `bg-amber-N`, `bg-cyan-N`, `bg-purple-N`, `text-emerald-N`, `text-amber-N`, `text-cyan-N`, `bg-green-N` or `bg-red-N` in any audited page or component (excluding the explicit `text-white` on `bg-brand` Button variants — that's intentional). Editor headings must respect theme.

### 1.1 DistractorBars — convert to Badge + tokens

**File:** `src/components/analytics/DistractorBars.tsx`

Lines 25–34 use raw `border-emerald-500/40 bg-emerald-500/10 text-emerald-200` and `border-amber-500/40 bg-amber-500/10 text-amber-200`. Lines 38, 45 use `text-cyan-300` / `bg-cyan-400` for percentage and bar fill. Replace:

- "Correct" tag → `<Badge tone="success" size="sm">Correct</Badge>`
- "Non-functional" tag → `<Badge tone="warning" size="sm">Non-functional</Badge>`
- Percentage span: `text-cyan-300` → `text-brand`
- Bar fill `bg-cyan-400` → `bg-brand`; `bg-emerald-400` → `bg-success`
- Bar track `bg-shell-bg` is already token-bound, leave as-is.

Verify: open distractor breakdown on `light-blue` theme — both tags are readable, percentages use brand colour, bar fill matches.

### 1.2 Blueprint placeholders — token-bound

**File:** `src/app/blueprint/page.tsx`

The title input (line 292) uses `placeholder-white/20`; the description textarea (line 299) uses `placeholder-white/10`. In a warm or light-blue theme those resolve to barely-visible white-on-cream. Replace both with `placeholder:text-shell-muted-dim`.

The "Empty Section" placeholder div (line 384) uses `border-white/10 ... bg-white/[0.01]` — likewise invisible in light. Replace with `border-shell-border ... bg-shell-input/30`.

### 1.3 Editor H1/H2/H3 — drop hardcoded white

**File:** `src/components/editor/TipTapEditor.css`

```css
/* Before */
.tiptap-content .tiptap h1,
.tiptap-content .tiptap h2,
.tiptap-content .tiptap h3 {
  color: white;
  margin: 0.8em 0 0.4em;
}

/* After */
.tiptap-content .tiptap h1,
.tiptap-content .tiptap h2,
.tiptap-content .tiptap h3 {
  color: var(--color-editor-text);
  margin: 0.8em 0 0.4em;
}
```

`--color-editor-text` is already overridden in `[data-theme="warm"]` and `[data-theme="light-blue"]` (verify in `globals.css` lines 41–56 and the corresponding theme blocks). If the warm/light overrides don't yet exist for `--color-editor-text`, add them — they should match the body foreground for the theme.

Also audit the rest of `TipTapEditor.css` for any `color: white`, `background: #fff*`, hardcoded `rgba(255, 255, 255, X)` and replace with tokens.

### 1.4 Blueprint page — bulk migration

**File:** `src/app/blueprint/page.tsx`

This file has the highest token-debt density. Migrations:

| Pattern | Replacement |
|---|---|
| `bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500` (h1, line 204) | `text-foreground` (Stage 8 cross-ref) |
| `bg-red-900/20 border border-red-500/50 text-red-400` (error banner, line 223) | `border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)]` |
| `border-white/5 hover:border-white/10` (blueprint card, line 239) | `border-shell-border hover:border-shell-border-deep` |
| `bg-blue-500` (status dot, line 250) | `bg-info` |
| `bg-white/5 rounded-2xl mb-12` (config bar, line 303) | `bg-shell-input rounded-2xl mb-12` |
| `bg-shell-input-alt` is correct for "off" toggle; `bg-brand` for "on" — already token-bound | (verify) |
| Toggle thumb `bg-white` (lines 323, 337) | `bg-shell-bg` (visible on both brand-blue and dark thumbs) — or make a `<Toggle>` primitive |
| `bg-black/20 border border-white/10` (number input, line 313) | `bg-shell-input border border-shell-border` |
| `bg-blue-500/20 text-blue-400` (FIXED rule chip, line 406) | `<Badge tone="info" size="sm">Fixed Item</Badge>` |
| `bg-purple-500/20 text-purple-400` (RANDOM rule chip, line 406) | `<Badge tone="accent" size="sm">Smart Draw</Badge>` |
| `bg-blue-500/10 hover:bg-blue-500/20 text-blue-400` (Change/Select, line 417) | `<Button variant="secondary" size="sm">` |
| `bg-blue-500/10 ... text-blue-400` "+ Specific Item" (line 491) | `<Button variant="secondary" size="sm" leadingIcon="+">` |
| `bg-purple-500/10 ... text-purple-400` "+ Smart Rule" (line 497) | `<Button variant="ghost" size="sm" leadingIcon="+">` (or accent variant — see Button.tsx variants; we may add an `accent` variant in this stage if needed) |
| All `bg-white/[0.0X]` rule cards (line 399) | `bg-shell-input/30 hover:bg-shell-input/60` |
| `border-white/5` / `border-white/10` (everywhere) | `border-shell-border` / `border-shell-border-deep` |
| `border-t-indigo-500 bg-brand/10` drag-over styling | `border-t-brand bg-[color-mix(in_oklab,var(--color-brand)_15%,transparent)]` |
| `text-red-400` Remove buttons | `text-danger` |
| `bg-black/40` numeric inputs (lines 437, 449, 461) | `bg-shell-input border-shell-border` |
| Hard-coded `bg-blue-600 hover:bg-blue-500 ... shadow-blue-500/20` Practice button (Stage 8) | `<Button variant="secondary">` |
| Hard-coded `bg-green-500 hover:bg-green-400 ... shadow-green-500/20` Publish button (Stage 8) | `<Button variant="success">` |
| `bg-brand hover:bg-brand shadow-lg shadow-indigo-500/20` "+ New Blueprint" (line 211) | `<Button variant="primary" size="lg">` |

After migration the file should pass: `grep -E "bg-white|text-white|bg-(blue|emerald|amber|red|green|purple|cyan|indigo|rose|slate)-[0-9]+|placeholder-white|border-white|bg-black/" src/app/blueprint/page.tsx` → no matches.

### 1.5 Cleanup pass on adjacent leakage

Files that share patterns and should be re-greppable clean afterwards:

- `src/app/page.tsx` (landing) — many `text-white`, `bg-blue-600`, `text-emerald-400`, `text-amber-400`. Migrate to tokens.
- `src/app/login/page.tsx` — `bg-blue-600`, `bg-red-500/10 ... text-red-500`. Migrate to tokens / `Button` primitive.
- `src/app/grading/[sessionId]/page.tsx` — many `bg-emerald-*`, `bg-red-*`, `border-emerald-*`, `text-emerald-*`. Migrate.
- `src/app/my-results/[sessionId]/page.tsx` — `text-amber-600`, `text-amber-500` (already mostly migrated). Replace with `text-[var(--color-warning-fg)]`.

### Stage 1 verification

```bash
# in frontend/
grep -rE "placeholder-white|bg-white/|border-white/|text-emerald-|bg-emerald-|text-amber-|bg-amber-|text-cyan-|bg-cyan-|text-purple-|bg-purple-|text-rose-|bg-rose-" src/app src/components 2>/dev/null
```

The only acceptable hits are: (a) intentional `text-white` on solid `bg-brand`/`bg-success`/`bg-danger` Button variants, (b) `bg-white/5` etc. inside legacy unmigrated pages NOT touched by this epoch (document them as known debt).

---

## Stage 2 — Authoring Bench Toolbar Polish

**File:** `src/app/author/page.tsx`

### 2.1 Remove "Status: Ready"

Lines 64–66 build `statusBadge` returning `<Badge tone="warning" size="sm">Saving…</Badge>`, `<Badge tone="danger" size="sm">Save failed</Badge>`, or `<Badge tone="neutral" size="sm">Ready</Badge>`. The neutral "Ready" badge is meaningless — every component is "ready" by default.

Replace with: only render a badge when status is non-idle. When `saveStatus === 'IDLE'`, render nothing for the badge slot. The eyebrow `Status` label can also go — the dirty StatusDot is sufficient.

### 2.2 Prevent reflow when dirty

Currently lines 109–177:

```tsx
<div className="flex flex-wrap items-end gap-4">
  <div className="flex items-center gap-2"> {/* Status block — grows when dirty */}
    <span ...>Status</span>
    {statusBadge}
    {isDirty && (
      <span className="flex items-center gap-1 text-xs ...">
        <StatusDot tone="warning" pulse />
        Unsaved changes
      </span>
    )}
  </div>
  <div className="flex-1" />
  <Field>...Subject...</Field>
  <Field>...Points...</Field>
  <Field>...Type...</Field>
  <Button>Revert</Button>
  <Button>Save</Button>
</div>
```

When the dirty pill appears, the row width exceeds the container and `flex-wrap` pushes Save onto a new line. Two options:

**Option A (preferred):** drop the eyebrow + neutral badge entirely. Keep only the dirty StatusDot + "Unsaved" pill. Move it to the right of the buttons (closer to where the action is) — or render it as a small absolute-positioned overlay above the toolbar.

**Option B:** swap `flex-wrap` for `flex-nowrap` and add `min-w-0 truncate` to Subject/Points/Type Fields and `shrink-0` to buttons. Constrains the pill to a single row but may clip Subject text on narrow widths.

Go with A: cleaner, avoids horizontal scroll on small screens.

```tsx
<div className="flex flex-wrap items-end gap-4 min-h-[2.5rem]">
  <Field label="Subject" className="w-32">...</Field>
  <Field label="Points" className="w-20">...</Field>
  <Field label="Type" className="min-w-[160px]">...</Field>
  <div className="flex-1" />
  {isDirty && (
    <span className="flex items-center gap-1.5 text-meta text-[var(--color-warning-fg)]">
      <StatusDot tone="warning" pulse />
      Unsaved
    </span>
  )}
  {saveStatus === 'SAVING' && <Badge tone="warning" size="sm">Saving…</Badge>}
  {saveStatus === 'ERROR' && <Badge tone="danger" size="sm">Save failed</Badge>}
  <Button variant="secondary" disabled={!isDirty || saveStatus === 'SAVING'} onClick={revertChanges}>Revert</Button>
  <Button variant="primary" disabled={!isDirty || saveStatus === 'SAVING'} loading={saveStatus === 'SAVING'} onClick={handleSave}>Save</Button>
</div>
```

`min-h-[2.5rem]` reserves vertical space for the dirty pill so the toolbar doesn't visibly twitch when editing begins.

### Stage 2 verification

- Open a clean question. Toolbar shows: Subject, Points, Type, Revert (disabled), Save (disabled). No "Status" eyebrow, no "Ready" badge.
- Type one character. The "Unsaved" pulse pill appears between fields and buttons. Save / Revert enable. Save button stays on the same row (no reflow).
- Click Save. Pill disappears (returns to clean state). Toast `Question saved` fires.

---

## Stage 3 — QuestionPickerModal Detail View Cleanup

**File:** `src/components/blueprint/QuestionPickerModal.tsx`

### 3.1 Drop the Status row

Lines 158–161 render Type / Status / Points / Topic in a 4-column grid. Status (`<Badge tone="success">{inspectedItem.latest_status}</Badge>`) is always "APPROVED" for any item the user could pick — a blueprint can only contain approved items. Drop the entire Status `<div>` block. The grid becomes 3 columns: Type / Points / Topic.

```tsx
<div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
  <div>{/* Type */}</div>
  <div>{/* Points */}</div>
  {inspectedItem.metadata_tags?.topic && <div>{/* Topic */}</div>}
</div>
```

### 3.2 Wrap long content

Line 149: `<p className="text-base leading-relaxed text-foreground">{inspectedItem.latest_content_preview}</p>`. If the preview contains very long URLs or unbroken strings, the parent's overflow forces a horizontal scrollbar. Add `break-words whitespace-pre-wrap` to the `<p>` and `min-w-0` to the surrounding `<div className="flex w-full max-w-3xl flex-col ...">` if needed.

```tsx
<p className="text-base leading-relaxed text-foreground break-words whitespace-pre-wrap">
  {inspectedItem.latest_content_preview}
</p>
```

Also audit the modal container (line 73) — it has `max-w-3xl` and `style={{ maxHeight: '80vh' }}`. The content area `flex-1 overflow-y-auto` (line 120) already constrains height. Confirm `overflow-x` defaults to `auto` (the bug); explicitly set `overflow-x-hidden` on that container to forbid horizontal scroll forever:

```tsx
<div className="flex-1 overflow-y-auto overflow-x-hidden p-3">
```

### Stage 3 verification

- Open Question Picker, click a question with a paragraph-long stem. No horizontal scrollbar. Long words break.
- Inspect view shows 3 fields max (Type / Points / Topic when topic exists; Type / Points when not). No "Status" field.

---

## Stage 4 — Library / Authoring Persistence

**Goal:** Mirror the `lastEditingId` pattern from `useBlueprintStore` for `useLibraryStore` so that `/items` ↔ `/author` round-trips survive nav-tab switches.

### 4.1 Extend `useLibraryStore`

**File:** `src/stores/useLibraryStore.ts`

Add to `LibraryState` interface:

```ts
lastEditingLoId: string | null;
setLastEditingLoId: (id: string | null) => void;
```

Initial state: `lastEditingLoId: null`. Action: `setLastEditingLoId: (id) => set({ lastEditingLoId: id }),`.

### 4.2 `/items` page restores last LO

**File:** `src/app/items/page.tsx`

Mount-time effect:

```ts
useEffect(() => {
    if (lastEditingLoId) {
        router.replace(`/author?lo_id=${lastEditingLoId}`);
        return;
    }
    fetchItems();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // run once
```

The `eslint-disable` is intentional — the same convention is used in `analytics/page.tsx` and `blueprint/page.tsx`. We only want this redirect to fire on initial mount, not on every store change.

### 4.3 `/author` page records and clears `lastEditingLoId`

**File:** `src/app/author/page.tsx`

In the existing `useEffect` that calls `fetchLatestVersion(loIdParam)`, also call `setLastEditingLoId(loIdParam)`. The Back button handler clears it:

```tsx
onClick={() => {
    setLastEditingLoId(null);  // ← new
    if (fromBlueprint && blueprintId) {
        router.push(`/blueprint?id=${blueprintId}`);
    } else {
        router.push('/items');
    }
}}
```

Also on `beforeunload` and route-change away (not via the Back button) we want to PRESERVE `lastEditingLoId` so navigating to `/blueprint` and back returns the user. The cleared-on-Back-button is the only manual clear path.

### 4.4 Edge case — deleted LO

If `lastEditingLoId` points to a learning object that has since been deleted, `/author` will show its "Linking to learning object…" spinner forever. Add a 5-second timeout in `fetchLatestVersion` that, on 404, clears `lastEditingLoId` and redirects back to `/items`.

### Stage 4 verification

- Open a question in `/author`. Switch to `/blueprint`. Click `Library` nav tab. → Returns to the same `/author?lo_id=...` page (not the list).
- Click ← Back to Library. → Goes to `/items` list. From now on, switching tabs and clicking Library keeps you on `/items`.
- Manually delete an LO via the API. Switch tabs. → `/items` redirects, `/author` 404s, then redirects back to `/items` and clears the stale id.

---

## Stage 5 — Analytics Information & Cleanup

### 5.1 New `InfoTooltip` primitive

**New file:** `src/components/ui/InfoTooltip.tsx`

Click-to-open tooltip, anchored to a small `(i)` icon. Closes on outside-click and Escape. Accessible via `aria-describedby`.

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from './cn';

interface InfoTooltipProps {
    children: React.ReactNode;
    label?: string; // a11y label for the trigger
    className?: string;
}

export default function InfoTooltip({ children, label = 'More info', className }: InfoTooltipProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <span ref={ref} className={cn('relative inline-flex', className)}>
            <button
                type="button"
                aria-label={label}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-shell-border bg-shell-input text-shell-muted-dim text-[10px] font-bold leading-none hover:text-foreground hover:border-shell-border-deep focus-ring"
            >
                i
            </button>
            {open && (
                <span
                    role="tooltip"
                    className={cn(
                        'absolute z-50 top-full left-0 mt-2 w-72',
                        'rounded-lg border border-shell-border bg-shell-surface shadow-elevated',
                        'px-3 py-2.5 text-meta text-foreground leading-relaxed',
                        'pointer-events-auto'
                    )}
                >
                    {children}
                </span>
            )}
        </span>
    );
}
```

Export from `components/ui/index.ts`. The tooltip is themed (uses shell tokens), keyboard-accessible, and its content slot accepts arbitrary JSX so we can include formulas, examples, etc.

### 5.2 Wire up tooltip on test-level metrics

**File:** `src/app/analytics/tests/[testId]/page.tsx`

Add `info` prop to the `<UIStatCard>` shim (and underlying primitive). Each `StatCard` in the grid (lines 171–178) gets a tooltip. Suggested copy:

| Metric | Tooltip text |
|---|---|
| Mean | "Average score across all published sessions, in percent." |
| Median | "The middle score: half of students scored higher, half lower. Less sensitive to outliers than the mean." |
| Std Dev | "Spread of scores around the mean. A large value means scores are very different from each other; a small value means most students scored similarly." |
| Pass Rate | "Percentage of students who scored at or above the test's pass threshold." |
| Cronbach's α | "Internal consistency: how reliably the items measure the same thing. Above 0.7 is acceptable; above 0.8 is good. Below 0.6 means the items don't agree with each other." |
| SEM | "Standard Error of Measurement. The expected fluctuation in a student's score if they took an equivalent version of this test. Smaller is better." |
| Min / Max | "Lowest and highest scores observed in the published sessions." |
| Flagged Items | "Items the system has flagged as too easy, too hard, or weakly discriminating, based on the most recent analytics snapshot." |

### 5.3 Wire up tooltip on item-level metrics

**Files:** `src/components/analytics/AllItemsTable.tsx`, `src/components/analytics/FlaggedItemsTable.tsx`

Add tooltips to the column headers `P` and `D`:

| Header | Tooltip text |
|---|---|
| P | "Difficulty (P-value): proportion of students who answered correctly. 0.20 = very hard, 0.90 = very easy. The sweet spot is roughly 0.30–0.80." |
| D | "Discrimination (D-value): how well this item separates strong students from weak students. Above 0.30 is good; below 0.15 is poor; negative means the item is misleading." |

Add tooltip on the distractor analysis container in `DistractorBars.tsx` explaining what "Non-functional" means: *"A distractor is non-functional if fewer than 5% of students chose it. It's not pulling its weight — consider rewriting or removing it."*

### 5.4 Drop Version column from FlaggedItemsTable

**File:** `src/components/analytics/FlaggedItemsTable.tsx`

Lines 60 (`{ key: 'version', label: 'Sort Version' }`), line 82 (`<th>Version</th>`), and line 96 (`<td>v{item.version_number ?? '—'}</td>`) all go. Also drop `'version'` from the `SortKey` type (line 10) and the corresponding branch in the sort comparator (lines 34–36).

### 5.5 Item analytics — drop the ugly UUID line

**File:** `src/app/analytics/items/[loId]/page.tsx`

Line 68: `<p className="mt-2 text-sm text-shell-muted-dim">Learning Object {loId}</p>`. Remove this line entirely. The `previewTitle` already says "Item 7040243f" or the actual content preview, which is sufficient; the full UUID adds noise. If we want a copyable identifier we can move it to a small `<code>` next to the title, but given the user's note ("looks very ugly"), simpler to remove.

### 5.6 Eyebrow + spacing cleanup

The "Item Analytics" eyebrow followed by the title and the (now removed) UUID line currently gives a 3-line stack. After removal, restore the eyebrow→title rhythm: the eyebrow is `text-eyebrow tracking-medium`, the title is `text-3xl`. Confirm spacing still feels right; reduce `mt-2` to `mt-1` on the title if needed.

### Stage 5 verification

- Open `/analytics/tests/<id>` → every stat card has an `(i)` icon. Click it → small tooltip pops out, themed correctly on dark / warm / light-blue. Click outside → closes.
- The Flagged Items table has columns: Item / P / D / Flags / Open. No Version column.
- The All Items table is unaffected (already had no Version column post-7.8).
- `/analytics/items/<loId>` shows eyebrow → title → no UUID line.
- Distractor breakdown box has an info `(i)` near the heading.

---

## Stage 6 — Grading Status Reform

**Premise:** A session containing only auto-gradable items (MCQ + MR) has no manual work pending. Today the system marks it `AUTO_GRADED`, which the dashboard treats as a separate state from `FULLY_GRADED`. The dashboard's "Fully graded" stat-card therefore under-reports completion. The user's expectation is: *if no human intervention is needed, it's fully graded.*

There are two viable approaches. We're picking the backend-first one because it makes the data correct everywhere (PDF exports, analytics, future audits), not just in the dashboard.

### 6.1 Backend — collapse `AUTO_GRADED` into `FULLY_GRADED` when no manual is pending

**File:** `backend/app/services/grading_service.py`

Two call sites:

**Site 1** — initial grade computation (line ~177):

```python
# Before
if pending_manual == 0:
    grading_status = GradingStatus.AUTO_GRADED.value if auto_graded > 0 else GradingStatus.UNGRADED.value
else:
    grading_status = GradingStatus.PARTIALLY_GRADED.value

# After
if pending_manual == 0 and auto_graded > 0:
    grading_status = GradingStatus.FULLY_GRADED.value
elif pending_manual == 0:
    grading_status = GradingStatus.UNGRADED.value
else:
    grading_status = GradingStatus.PARTIALLY_GRADED.value
```

**Site 2** — `compute_session_aggregate` (line ~245) already uses `FULLY_GRADED` once `pending == 0 and questions_total > 0`, so this is consistent. Verify no other path writes `AUTO_GRADED`.

### 6.2 Decide what to do with `AUTO_GRADED` enum

Keep the enum value (it's persisted historically). The application code stops writing it but reads will still flow. The frontend should map any incoming `AUTO_GRADED` to "Fully graded" for display, treating it as legacy.

**File:** `frontend/src/app/grading/page.tsx`

```ts
function statusBadge(status: GradingStatus) {
    const map: Record<GradingStatus, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' }> = {
        UNGRADED: { label: 'Ungraded', tone: 'neutral' },
        AUTO_GRADED: { label: 'Fully graded', tone: 'success' },  // ← display-only collapse
        PARTIALLY_GRADED: { label: 'Partial', tone: 'warning' },
        FULLY_GRADED: { label: 'Fully graded', tone: 'success' },
    };
    ...
}
```

Stat-card calculation also folds AUTO_GRADED into "fully":

```ts
fullyGraded: gradingOverview.filter(s =>
    s.grading_status === 'FULLY_GRADED' || s.grading_status === 'AUTO_GRADED'
).length,
```

### 6.3 Tests

**Files:**

- `backend/tests/test_grading_service.py` (or wherever `compute_initial_grades` is tested) — add a test: "session with only auto-gradable items receives `FULLY_GRADED` status, not `AUTO_GRADED`."
- If existing tests assert `AUTO_GRADED`, update them to expect `FULLY_GRADED`. Run `pytest backend/tests` and confirm green.

### 6.4 Migration considerations

No DB migration. The enum value `AUTO_GRADED` remains valid (historical rows keep it). New rows simply never get this value going forward.

### Stage 6 verification

- Submit an MCQ-only practice exam. Open `/grading`. Stat-card "Fully graded: 1 / 1" instead of "0 / 1". Row badge shows "Fully graded" not "Auto-graded".
- Submit an essay-containing exam. Initial state: "Partial" (0 manual graded). After grading every essay manually, status flips to "Fully graded".
- `pytest backend/tests/test_grading_service.py` — green.

---

## Stage 7 — Student "My Grades" Tab

### 7.1 Nav addition

**File:** `src/components/layout/GlobalHeader.tsx`

```ts
const navLinks =
    user?.role === 'STUDENT'
        ? [
              { name: 'My Exams', href: '/my-exams' },
              { name: 'My Grades', href: '/my-grades' },  // ← new
          ]
        : [...];
```

### 7.2 New page `/my-grades`

**New file:** `src/app/my-grades/page.tsx`

Two sections:

- **Awaiting grade** — sessions where `submitted_at != null` AND `letter_grade == null` (or `is_published == false`). Shows submitted date, grading-status badge ("Awaiting manual grading" / "Partial" / "Awaiting publication"). No drill-down link.
- **Published results** — sessions with `letter_grade != null` AND `is_published == true`. Card with score, percentage, letter grade, link to `/my-results/<sessionId>`.

### 7.3 Backend — extend `/student/results/` to include unpublished but submitted

**Investigate:** the existing `useResultsStore.fetchMyResults` likely already returns published only. We need a separate endpoint or query that lists *all submitted-but-not-yet-published* sessions.

Three options ordered by simplicity:

1. **Frontend joins:** Pull `useStudentSessionsStore.sessions` (which already returns scheduled sessions with `existing_attempt_id`) and `useResultsStore.myResults`. A submitted session whose attempt id has no published result → "awaiting grade". This requires no backend change but does require the frontend to know each scheduled-session's attempt status (Stage 9 already adds this).
2. **New backend endpoint** `/student/sessions/submitted/` returning: `[{session_id, test_title, submitted_at, grading_status, is_published}]`. ~30 lines of service + route.
3. **Extend existing `/student/results/`** to include unpublished if `?include_unpublished=true`. Server still gates body content (no detail leak); only metadata returned.

Pick option 1 — it slots into the data we're already shipping for Stage 9. If during implementation we find the join too brittle, fall back to option 2.

### 7.4 Move grade list out of `/my-exams`

**File:** `src/app/my-exams/page.tsx`

Lines 95–139 render the "My grades" section. Remove it. `/my-exams` now shows only Joinable + Scheduled. Add a footer hint card: *"Looking for past results? See My Grades →"* with a link.

### 7.5 EmptyState handling

`/my-grades` with zero entries in either section uses two `EmptyState` blocks. If the student has never taken a graded exam, the page still renders meaningfully:

```tsx
<EmptyState
    title="No grades yet"
    description="Once you submit an exam, the result will appear here."
/>
```

### Stage 7 verification

- Log in as STUDENT. Header shows two tabs: My Exams, My Grades. Both navigate correctly.
- `/my-exams` no longer shows the My Grades section.
- `/my-grades` shows two sections: pending (with neutral badge) and published (with score/grade Card).
- Submit a brand-new exam → it appears in pending. After educator publishes → moves to published, drill-down works.

---

## Stage 8 — Blueprint Publish/Practice UX & Validation

**File:** `src/app/blueprint/page.tsx`

### 8.1 Toast on save / publish

In `handleSave` (line 137):

```tsx
const { toast } = useToast();
...
const handleSave = async () => {
    if (!currentBlueprint) return;

    // Frontend validation
    const minutes = currentBlueprint.duration_minutes;
    if (!minutes || minutes <= 0) {
        toast({
            tone: 'danger',
            title: 'Cannot publish',
            description: 'Set a duration greater than 0 minutes before publishing.',
        });
        return;
    }

    try {
        const id = await saveBlueprint(currentBlueprint);
        toast({ tone: 'success', title: 'Blueprint published',
                description: currentBlueprint.title || 'Untitled blueprint' });
        if (!idFromUrl) {
            router.push(`/blueprint?id=${id}`);
        }
    } catch (err) {
        toast({ tone: 'danger', title: 'Publish failed',
                description: err instanceof Error ? err.message : 'Try again.' });
    }
};
```

### 8.2 Same validation on Practice

```tsx
const handleStartPreview = async () => {
    if (!idFromUrl) return;

    const minutes = currentBlueprint?.duration_minutes;
    if (!minutes || minutes <= 0) {
        toast({
            tone: 'danger',
            title: 'Cannot start practice',
            description: 'Set a duration greater than 0 minutes first.',
        });
        return;
    }

    setIsStarting(true);
    try {
        const sessionId = await instantiateSession(idFromUrl);
        router.push(`/exam/${sessionId}`);
    } catch (err) {
        toast({ tone: 'danger', title: 'Practice failed',
                description: err instanceof Error ? err.message : 'Try again.' });
    } finally {
        setIsStarting(false);
    }
};
```

Also disable both buttons when duration is invalid:

```tsx
const minutesValid = (currentBlueprint?.duration_minutes ?? 0) > 0;
...
<Button variant="secondary" onClick={handleStartPreview} disabled={isStarting || !minutesValid}>
  {isStarting ? 'Loading...' : 'Practice Blueprint'}
</Button>
<Button variant="success" onClick={handleSave} disabled={!minutesValid}>
  Publish Blueprint
</Button>
```

### 8.3 Inline error on the duration input

Show a small `text-danger` line directly under the input when invalid:

```tsx
{currentBlueprint?.duration_minutes !== undefined && currentBlueprint.duration_minutes <= 0 && (
    <p className="mt-1 text-meta text-danger">Duration must be at least 1 minute.</p>
)}
```

### 8.4 Replace raw Practice / Publish / "+ New" buttons with primitives (folded from Stage 1)

Carry over the migrations listed in §1.4 — ensure both buttons are `<Button variant="secondary">` and `<Button variant="success">` respectively, not raw `<button class="bg-blue-600 ...">`.

### 8.5 Animation parity

The user asked for "the animation that was put for creating a course and scheduling a session". That animation is the toast slide-in (defined in `Toast.tsx` via the `transition-all duration-300` plus the absence of any explicit enter animation — relies on React mount + CSS). It's identical for any toast tone. Just calling `toast({ tone: 'success', ... })` reuses the same enter animation.

If the user wants a more dramatic animation (confetti / pulse on the published button) — out of scope for this stage; flag as a Stage 11 polish-add-on if requested.

### Stage 8 verification

- Open a blueprint, set duration to `0` or empty → both buttons disable, inline red text shows under the input.
- Set duration to `60` → buttons enable. Click Publish → success toast slides in (same as session-scheduled toast). URL updates to include the new id.
- Click Practice with duration 0 → toast danger, no navigation.
- Click Practice with valid duration → exam loads.

---

## Stage 9 — Resume vs. Already-Submitted Distinction

### 9.1 Backend — extend `/student/sessions/` payload

**File:** `backend/app/schemas/scheduled_session.py`

Add to the response schema:

```python
class StudentScheduledSessionView(BaseModel):
    ...
    existing_attempt_id: Optional[UUID] = None
    existing_attempt_status: Optional[Literal["STARTED", "SUBMITTED", "EXPIRED"]] = None
```

**File:** `backend/app/services/scheduled_sessions_service.py`

Lines 225–256 already build the response. Extend:

```python
existing_attempt = attempts_by_session_id.get(record.id)
existing_attempt_status = existing_attempt.status if existing_attempt else None

results.append({
    ...
    "existing_attempt_id": existing_attempt.id if existing_attempt else None,
    "existing_attempt_status": existing_attempt_status,
})
```

### 9.2 Backend `can_join` semantics

Today: `can_join = record.status == ACTIVE`. After this stage: `can_join = record.status == ACTIVE AND (existing_attempt_status is None OR existing_attempt_status == "STARTED")`. A session you've already submitted is not joinable.

### 9.3 Frontend — type extension

**File:** `src/stores/useStudentSessionsStore.ts`

```ts
export interface StudentScheduledSession {
    ...
    existing_attempt_id: string | null;
    existing_attempt_status: 'STARTED' | 'SUBMITTED' | 'EXPIRED' | null;
}
```

### 9.4 Frontend — `StudentExamCard` states

**File:** `src/components/student/StudentExamCard.tsx`

Three exclusive button states:

```tsx
const status = session.existing_attempt_status;
const canResume = status === 'STARTED' && session.can_join;
const alreadySubmitted = status === 'SUBMITTED';
const alreadyExpired = status === 'EXPIRED';
const canJoinFresh = !status && session.can_join;

// Badge
<Badge tone={
    alreadySubmitted ? 'info' :
    alreadyExpired ? 'neutral' :
    session.can_join ? 'success' : 'neutral'
} size="sm">
    {alreadySubmitted ? 'Submitted' :
     alreadyExpired ? 'Expired' :
     session.can_join ? 'Joinable now' : 'Upcoming'}
</Badge>

// Action button
{alreadySubmitted ? (
    <Button variant="secondary" fullWidth disabled
            onClick={() => router.push(`/my-grades`)}>
        Already submitted — see My Grades
    </Button>
) : alreadyExpired ? (
    <Button variant="ghost" fullWidth disabled>
        Window closed — exam expired
    </Button>
) : (
    <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!canResume && !canJoinFresh}
        onClick={() => onJoin(session)}
    >
        {canResume ? 'Resume exam' : 'Join exam'}
    </Button>
)}
```

(The "see My Grades" button can be a real `Link` — not disabled — leading to the new page.)

### 9.5 Frontend — `/my-exams` filter respects new state

In `app/my-exams/page.tsx`:

```ts
const currentSessions = sessions.filter(
    (s) => s.can_join && s.existing_attempt_status !== 'SUBMITTED'
);
```

Already-submitted sessions show in their own section ("Submitted") OR are quietly dropped from `/my-exams` since they live in `/my-grades` now. Pick: drop them from `/my-exams`, surface in `/my-grades`. Add a third section header to `/my-grades` if needed.

### Stage 9 verification

- Student joins a session, fills two answers, exits without submitting. `/my-exams` shows it as "Joinable now" with "Resume exam".
- Student submits the exam. `/my-exams` no longer shows that session as joinable. `/my-grades` shows it under "Awaiting grade".
- Educator publishes. `/my-grades` moves it to "Published".

---

## Stage 10 — Toast Hydration Fix

**File:** `src/components/ui/Toast.tsx`

The current `ToastProvider`:

```tsx
export function ToastProvider() {
    const toasts = useToastStore((s) => s.toasts);
    if (typeof window === 'undefined') return null;  // ← SSR returns null
    return createPortal(<div ...>{toasts.map(...)}</div>, document.body);
}
```

On first client render, `typeof window === 'undefined'` is false, so we render the portal. The HTML the server sent had nothing for this slot. React detects mismatch → warning + tree regen.

Fix with the standard `mounted`-flag pattern:

```tsx
export function ToastProvider() {
    const toasts = useToastStore((s) => s.toasts);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;  // SSR + first client render both return null
    // After hydration, the useEffect fires → mounted=true → portal mounts on next render
    return createPortal(
        <div aria-label="Notifications" className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
            {toasts.map((t) => <Toast key={t.id} toast={t} />)}
        </div>,
        document.body,
    );
}
```

Now SSR HTML and first client render both produce nothing for this slot — no mismatch. The portal mounts after hydration completes.

### Stage 10 verification

- Open `/my-exams` in a clean browser session (Cmd-Shift-R). Open devtools. → No "Hydration failed because the server rendered HTML didn't match" error.
- Trigger a toast (e.g., schedule a session) → still works, slides in normally.

---

## Stage 11 — Verification

### 11.1 Type + build

```bash
cd frontend
npx tsc --noEmit
npx next build
```

Both must exit clean.

### 11.2 Cleanliness greps

```bash
# Stage 1 — token coverage
grep -rE "placeholder-white|bg-white/[0-9]|border-white/[0-9]|text-(emerald|amber|cyan|purple|rose|red)-[0-9]+|bg-(emerald|amber|cyan|purple|rose|red|blue|green|indigo)-[0-9]+/?[0-9]*" src/app src/components

# Stage 2 — no neutral "Ready" badge
grep -n "Ready" src/app/author/page.tsx

# Stage 3 — Status text not in inspect view
grep -n "latest_status" src/components/blueprint/QuestionPickerModal.tsx
# (one match expected, in `excludeIds` filtering. Status row gone.)

# Stage 4 — persistence wired
grep -n "lastEditingLoId" src/stores/useLibraryStore.ts src/app/items/page.tsx src/app/author/page.tsx

# Stage 5 — Version column gone, InfoTooltip in place
grep -n "Version" src/components/analytics/FlaggedItemsTable.tsx
grep -rn "InfoTooltip" src/app/analytics

# Stage 6 — backend collapse
grep -n "FULLY_GRADED\|AUTO_GRADED" backend/app/services/grading_service.py

# Stage 7 — new page exists, nav link present
test -f src/app/my-grades/page.tsx && echo "OK"
grep -n "My Grades" src/components/layout/GlobalHeader.tsx

# Stage 8 — toasts wired
grep -n "useToast\|toast(" src/app/blueprint/page.tsx

# Stage 9 — new field present
grep -n "existing_attempt_status" src/stores/useStudentSessionsStore.ts src/components/student/StudentExamCard.tsx backend/app/schemas/scheduled_session.py backend/app/services/scheduled_sessions_service.py

# Stage 10 — mounted pattern
grep -n "mounted" src/components/ui/Toast.tsx
```

Each grep should produce the expected presence/absence. Document any exception inline.

### 11.3 Manual theme matrix

Tested screens (3 themes each):

- `/items`, `/author`, `/blueprint` (list + edit), `/sessions`, `/grading`, `/grading/<sid>`, `/analytics`, `/analytics/tests/<id>`, `/analytics/items/<loId>`, `/my-exams`, `/my-grades`, `/my-results/<sid>`, `/login`, landing page.
- Confirm: tags readable, placeholders visible, headings legible in editor, info tooltips themed, button colours theme-aware, no horizontal scroll, no hydration errors in devtools.

### 11.4 Backend tests

```bash
cd backend
pytest tests/test_grading_service.py
pytest tests/test_scheduled_sessions.py
```

Both must be green. New tests added in 6.3 and 9.x must be among them.

### 11.5 Aikido

Run Aikido security scan before merging. Zero new Critical/High findings.

---

## Files Touched (estimate)

**Frontend (~24 files):**

- `src/app/blueprint/page.tsx` (heavy)
- `src/app/author/page.tsx`
- `src/app/items/page.tsx`
- `src/app/analytics/page.tsx` (light — only if accent prop changes propagate)
- `src/app/analytics/tests/[testId]/page.tsx`
- `src/app/analytics/items/[loId]/page.tsx`
- `src/app/my-exams/page.tsx`
- `src/app/my-grades/page.tsx` (new)
- `src/app/login/page.tsx`
- `src/app/page.tsx` (landing)
- `src/app/grading/[sessionId]/page.tsx` (token migration)
- `src/components/analytics/DistractorBars.tsx`
- `src/components/analytics/FlaggedItemsTable.tsx`
- `src/components/analytics/AllItemsTable.tsx`
- `src/components/analytics/StatCard.tsx` (info prop)
- `src/components/blueprint/QuestionPickerModal.tsx`
- `src/components/student/StudentExamCard.tsx`
- `src/components/layout/GlobalHeader.tsx`
- `src/components/ui/InfoTooltip.tsx` (new)
- `src/components/ui/StatCard.tsx` (info prop pass-through)
- `src/components/ui/Toast.tsx`
- `src/components/ui/index.ts`
- `src/components/editor/TipTapEditor.css`
- `src/stores/useLibraryStore.ts`
- `src/stores/useStudentSessionsStore.ts`
- `src/app/grading/page.tsx` (folding AUTO_GRADED display)

**Backend (~3 files + tests):**

- `backend/app/services/grading_service.py`
- `backend/app/services/scheduled_sessions_service.py`
- `backend/app/schemas/scheduled_session.py`
- `backend/tests/test_grading_service.py` (new test)
- `backend/tests/test_scheduled_sessions.py` (extend)

**Directives:**

- `directives/epoch_7_9_blueprint.md` (this file)
- `directives/epoch_roadmap.md` (add Epoch 7.9 entry)

---

## Exit Criteria

- All 21 catalogued issues + folded side polish verified fixed.
- `npx tsc --noEmit` and `npx next build` exit clean.
- `pytest backend/tests` green; new tests for grading-status reform and student-session payload included.
- Theme matrix (dark / warm / light-blue) screenshot-verified across all 13 audited screens.
- Hydration error gone from `/my-exams` and any other SSR'd page.
- Cleanliness greps in §11.2 produce expected results.
- Aikido scan: zero new Critical/High findings.

---

## Out of Scope (deferred)

- New animations beyond reusing the existing toast enter (e.g., confetti / pulse on Publish). If desired, raise as a separate polish ticket — Epoch 8 candidate.
- Reorganising `/grading` layout — the user only asked for the auto-graded fix, not a redesign.
- Backend rename of the `AUTO_GRADED` enum value or DB migration. Historical data keeps the value; new code stops writing it.
- LO-deletion garbage-collection of orphan `lastEditingLoId` (we simply 404-and-clear at runtime).
- Confetti on session publish (frontend-design opportunity, not a 7.9 issue).

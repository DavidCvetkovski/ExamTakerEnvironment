# Epoch 8.1 Blueprint — UX Hardening, Blueprint Lifecycle & Home Screen

> **Branch:** `feature/epoch-8-1-ux`
> **Prerequisites:** Epoch 8 merged to `main`.
> **Scope:** Frontend-first (9 of 10 stages). One backend touch: blueprint immutability guard on `/api/tests/{id}` (PATCH/DELETE) and a new `GET /api/tests/{id}/usage` endpoint. No DB migrations. No new product surface beyond the home screen redesign.
> **CLAUDE.md principles in play:** Security (server-side immutability guard, not just frontend), Maintainability (confirm dialogs as a reusable `useConfirm` hook, not ad-hoc per page), Modularity (each stage touches one domain), Scalability (blueprint sort/search is frontend-only; no pagination needed at current scale).

---

## Progress Checklist

- [x] Stage 1 — Import UX Overhaul (no nav tab, entry points, mode toggle, tag rename, persistence, exit warning)
- [x] Stage 2 — Blueprint Management (immutability, delete, duplicate, sort, search)
- [x] Stage 3 — Safety Dialogs (blueprint back + authoring back — unsaved confirmation)
- [x] Stage 4 — TimePicker 1-minute increments
- [x] Stage 5 — QuestionPickerModal: truncation + Add button always visible
- [x] Stage 6 — Practice Exam Completion Screen
- [x] Stage 7 — Grading Tab: light-theme color fix
- [x] Stage 8 — Analytics InfoTooltip: z-index & clipping fix
- [x] Stage 9 — Home Screen: animated redesign + remove hardcoded credentials
- [x] Stage 10 — Verification

---

## Issues Catalogue

| # | Issue | Stage |
|---|---|---|
| 1 | Import is a standalone nav tab — should only be reachable from Library or Blueprints | 1 |
| 2 | No way to import questions-only without creating a blueprint | 1 |
| 3 | Format guide is a tiny `(i)` — too hidden | 1 |
| 4 | Import template is sparse and lacks intuitive guidance | 1 |
| 5 | `TAGS:` field name is confusing — it's really subjects/topics | 1 |
| 6 | Pasted text + settings lost on page navigation | 1 |
| 7 | No "unsaved import" warning when navigating away | 1 |
| 8 | "Target item bank" selector is noise — only one bank exists | 1 |
| 9 | "Commit Import" button label is not plain-English obvious | 1 |
| 10 | Blueprints used in scheduled sessions are still editable | 2 |
| 11 | No way to delete a blueprint | 2 |
| 12 | No way to duplicate a (potentially locked) blueprint | 2 |
| 13 | No sort or search on blueprint list | 2 |
| 14 | "← All Blueprints" back button doesn't navigate when already on `/blueprint` | 3 |
| 15 | No unsaved-changes confirmation when leaving blueprint editor | 3 |
| 16 | No unsaved-changes confirmation when leaving authoring workbench | 3 |
| 17 | TimePicker jumps in 5-minute steps, user wants per-minute | 4 |
| 18 | "Add Specific Item" modal: question text overflows; Add button is off-screen | 5 |
| 19 | Practice exam completion screen identical to student submission screen | 6 |
| 20 | Grading detail page: correct/incorrect/pass/fail colors invisible on light themes | 7 |
| 21 | Analytics InfoTooltip panel is partially clipped by parent overflow | 8 |
| 22 | Home screen shows hardcoded test credentials | 9 |
| 23 | Home screen has no visual identity or animation | 9 |

---

## Stage 1 — Import UX Overhaul

### 1.1 Remove Import from global nav

**File:** `src/components/layout/GlobalHeader.tsx`

Remove `{ name: 'Import', href: '/import' }` from `navLinks`. The page still exists at `/import` — it just has no nav link. Users reach it from entry points in Library and Blueprints.

### 1.2 Entry point — Library page

**File:** `src/app/items/page.tsx`

Add an "Import questions" button next to "+ New question" in `PageHeader.actions`:

```tsx
actions={
    <div className="flex items-center gap-2">
        <Button variant="secondary" size="md" onClick={() => router.push('/import')}>
            ↑ Import
        </Button>
        <Button variant="primary" size="md" loading={isCreating} onClick={handleCreateNew}>
            + New question
        </Button>
    </div>
}
```

### 1.3 Entry point — Blueprints page

**File:** `src/app/blueprint/page.tsx`

The existing "Or import questions from text →" link (added in Epoch 8) stays. Make it a proper `<Button variant="ghost" size="sm">` instead of a plain `<a>` tag so it's visually consistent.

### 1.4 "Import questions only" vs "Import + blueprint" — reframe the toggle

**File:** `src/app/import/page.tsx`

Replace the checkbox toggle with two clearly labelled radio-style cards that set mode:

```
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│  📋 Import Questions Only       │  │  📐 Import + Create Blueprint   │
│  Add questions to your library  │  │  Build a ready-to-use exam too  │
│  (no blueprint created)         │  │  (questions + blueprint draft)  │
└─────────────────────────────────┘  └─────────────────────────────────┘
```

Selected card gets a `border-brand` ring. Maps to `createBlueprint: false | true` in the store. Default: "Import + Create Blueprint" when arriving from `/blueprint`, "Import Questions Only" when arriving from `/items`. Pass via query param: `/import?mode=questions` or `/import?mode=blueprint`.

### 1.5 Remove "Target Item Bank" selector

**File:** `src/app/import/page.tsx`

The application has one bank. Remove the bank `<Select>` and the `fetchBanks` call entirely. Instead, resolve the bank server-side: `persister.py` already calls `prisma.item_banks.find_first()` and creates one if none exists — replicate that behaviour in the endpoint.

**File:** `backend/app/api/endpoints/import_endpoints.py`

Remove `bank_id` from `ImportCommitRequest`. In `commit_import`, resolve the bank:

```python
bank = await prisma.item_banks.find_first()
if not bank:
    bank = await prisma.item_banks.create(data={"name": "Default Bank", "created_by": str(current_user.id)})
bank_id = bank.id
```

Remove `GET /api/import/banks` endpoint. Remove `ItemBankResponse` model.

**File:** `src/stores/useImportStore.ts`

Remove `banks`, `bankId`, `setBankId`, `fetchBanks`. Remove `bank_id` from commit payload.

### 1.6 Rename "Commit Import" → "Import"

**File:** `src/app/import/page.tsx`

```tsx
<Button variant="primary" size="lg" onClick={commitImport} disabled={!canCommit} loading={isCommitting}>
    Import
</Button>
```

### 1.7 Rename `TAGS:` → `SUBJECT:` in format + parser

Users are correct — tags in this context are subjects/topics. `TAGS:` maps to `metadata_tags.topic` (first value) and `metadata_tags.tags`. Rename the keyword to `SUBJECT:` so it's semantically obvious. Keep `TAGS:` as a deprecated alias (parser accepts both, emits a warning when `TAGS:` is used: "TAGS: is deprecated — use SUBJECT: instead").

**File:** `backend/app/services/import_service/lexer.py`

Add `"SUBJECT"` to `METADATA_KEYS`.

**File:** `backend/app/services/import_service/assembler.py`

In `_handle_metadata`, handle `key == "SUBJECT"` the same as `key == "TAGS"`. When `key == "TAGS"`, still parse but emit a deprecation warning via the validator.

**File:** `backend/app/services/import_service/validator.py`

Track which questions used `TAGS:` and add a `ParseErrorSeverity.WARNING`: "TAGS: is deprecated — use SUBJECT: instead."

**Files:** `frontend/public/import-template.txt`, `src/components/import/FormatGuideModal.tsx`

Update all references: `TAGS:` → `SUBJECT:`. Update the Quick Reference table. Update the FAQ.

### 1.8 Make the Format Guide more prominent

**File:** `src/app/import/page.tsx`

Replace the tiny `(i)` button with a visible link button in the page header area:

```tsx
<Button variant="ghost" size="sm" onClick={() => setShowGuide(true)}>
    📖 Format Guide
</Button>
```

Place it prominently in the toolbar above the textarea, not buried next to the `<h1>`.

### 1.9 Improve the downloadable template

**File:** `frontend/public/import-template.txt`

Rewrite to be more guided — add inline comments explaining each field, include realistic example values (not `[placeholder]` brackets), and include a short "cheatsheet" comment block at the top:

```
// QUICK CHEATSHEET
// ─────────────────────────────
// #Q        Start a question (required)
// TYPE:     MCQ | MCQ_MULTI | ESSAY (required)
// LEVEL:    Remember | Understand | Apply | Analyze | Evaluate | Create
// DIFFICULTY: Easy | Medium | Hard
// POINTS:   integer ≥ 1 (default: 1)
// SUBJECT:  The topic/subject area (e.g. Statistics, Calculus)
// A) text * Mark the correct answer with " *" at the end
// ─────────────────────────────
```

Then include two fully worked examples (one MCQ, one essay) with realistic university-level content (not lorem ipsum).

### 1.10 Persist text and settings across navigation

**File:** `src/stores/useImportStore.ts`

Add `persist` middleware from zustand so `rawText` and `createBlueprint` survive navigation. Use `sessionStorage` (not `localStorage`) so the draft clears when the browser closes.

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const useImportStore = create<ImportState>()(
    persist(
        (set, get) => ({ ... }),
        {
            name: 'openvision-import-draft',
            storage: createJSONStorage(() => sessionStorage),
            partialize: (s) => ({ rawText: s.rawText, createBlueprint: s.createBlueprint }),
        }
    )
);
```

### 1.11 Unsaved import exit warning

**File:** `src/app/import/page.tsx`

If `rawText.trim().length > 0` and `commitStatus !== 'completed'`, attach a `beforeunload` handler and intercept Next.js navigation with a confirm dialog.

```tsx
useEffect(() => {
    const isDirty = rawText.trim().length > 0 && commitStatus !== 'completed';
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
}, [rawText, commitStatus]);
```

For in-app navigation (clicking Library, Blueprints, etc.), use the shared `useConfirm` hook introduced in Stage 3:

```tsx
const confirmed = await confirm({
    title: 'Leave without importing?',
    message: 'You have pasted text that has not been imported yet. Your draft will be cleared.',
    confirmLabel: 'Leave',
    cancelLabel: 'Stay',
    tone: 'warning',
});
if (!confirmed) return;
```

Wire this into a custom router push wrapper, or use the Link `onClick` pattern on nav items.

### Stage 1 verification

```bash
# Nav link gone
grep -n "'Import'" src/components/layout/GlobalHeader.tsx  # 0 matches

# Entry points present
grep -n "import" src/app/items/page.tsx     # ↑ Import button
grep -n "import" src/app/blueprint/page.tsx # ghost button

# Bank selector gone
grep -n "bankId\|fetchBanks\|Target.*bank" src/app/import/page.tsx  # 0 matches

# SUBJECT: in parser
grep -n "SUBJECT" backend/app/services/import_service/lexer.py
grep -n "SUBJECT" frontend/public/import-template.txt
```

---

## Stage 2 — Blueprint Management: Immutability, Delete, Duplicate, Sort & Search

### 2.1 Blueprint usage status — backend

Add a `GET /api/tests/{test_id}/usage` endpoint that returns whether the blueprint is used in any sessions.

**File:** `backend/app/api/endpoints/tests.py`

```python
class BlueprintUsage(BaseModel):
    has_scheduled_sessions: bool    # linked to any scheduled_exam_sessions
    has_past_sessions: bool         # linked to sessions with status CLOSED or CANCELED
    is_locked: bool                 # has_scheduled_sessions (cannot edit)
    is_permanently_locked: bool     # has_past_sessions (cannot edit or delete)

@router.get("/{test_id}/usage", response_model=BlueprintUsage)
async def get_blueprint_usage(
    test_id: UUID,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    scheduled = await prisma.scheduled_exam_sessions.find_many(
        where={"test_definition_id": str(test_id)}
    )
    has_scheduled = len(scheduled) > 0
    has_past = any(s.status in ("CLOSED", "CANCELED") for s in scheduled)
    return BlueprintUsage(
        has_scheduled_sessions=has_scheduled,
        has_past_sessions=has_past,
        is_locked=has_scheduled,
        is_permanently_locked=has_past,
    )
```

### 2.2 Guard PATCH / DELETE on locked blueprints — backend

**File:** `backend/app/api/endpoints/tests.py` (PATCH / PUT / DELETE handlers)

Before any mutation, check usage:

```python
async def _assert_blueprint_mutable(test_id: str, allow_delete: bool = False) -> None:
    scheduled = await prisma.scheduled_exam_sessions.find_many(
        where={"test_definition_id": test_id}
    )
    if not scheduled:
        return  # not used anywhere — always OK
    has_past = any(s.status in ("CLOSED", "CANCELED") for s in scheduled)
    if has_past and allow_delete:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This blueprint has been used in a completed session and cannot be deleted.",
        )
    if scheduled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This blueprint is linked to one or more sessions and cannot be edited.",
        )
```

Call `await _assert_blueprint_mutable(str(test_id))` at the top of update handlers, and `await _assert_blueprint_mutable(str(test_id), allow_delete=True)` in the delete handler.

### 2.3 Delete endpoint — backend

**File:** `backend/app/api/endpoints/tests.py`

```python
@router.delete("/{test_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_test_definition(
    test_id: UUID,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    await _assert_blueprint_mutable(str(test_id), allow_delete=True)
    await prisma.test_definitions.delete(where={"id": str(test_id)})
```

### 2.4 Duplicate endpoint — backend

**File:** `backend/app/api/endpoints/tests.py`

```python
@router.post("/{test_id}/duplicate", response_model=dict, status_code=status.HTTP_201_CREATED)
async def duplicate_test_definition(
    test_id: UUID,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Create an independent copy of a blueprint. The copy is always editable."""
    original = await prisma.test_definitions.find_unique(where={"id": str(test_id)})
    if not original:
        raise HTTPException(status_code=404, detail="Blueprint not found.")
    import uuid as _uuid
    copy = await prisma.test_definitions.create(data={
        "id": str(_uuid.uuid4()),
        "title": f"{original.title} (Copy)",
        "description": original.description,
        "created_by": str(current_user.id),
        "blocks": original.blocks,
        "duration_minutes": original.duration_minutes,
        "shuffle_questions": original.shuffle_questions,
        "scoring_config": original.scoring_config,
    })
    return {"id": copy.id}
```

### 2.5 Frontend: fetch usage + lock state

**File:** `src/stores/useBlueprintStore.ts`

Add `usageMap: Record<string, BlueprintUsage>` to state. After `fetchBlueprints()`, fire `GET /api/tests/{id}/usage` for each blueprint (parallelised with `Promise.all`). Cache in `usageMap`.

```ts
interface BlueprintUsage {
    has_scheduled_sessions: boolean;
    has_past_sessions: boolean;
    is_locked: boolean;
    is_permanently_locked: boolean;
}
```

### 2.6 Blueprint list — lock badges, delete, duplicate

**File:** `src/app/blueprint/page.tsx`

Blueprint card UI changes:

- If `usage.is_permanently_locked`: show `<Badge tone="neutral" size="sm">Locked</Badge>` + tooltip: "Used in a past session — read-only". No edit button. No delete button. Show a **Duplicate** button.
- If `usage.is_locked` (but not permanently): show `<Badge tone="warning" size="sm">In use</Badge>` + tooltip: "Linked to an active session — editing disabled". No edit button. No delete button. Show a **Duplicate** button.
- If not locked: show **Edit** (opens editor) + **Delete** (with confirm dialog) + **Duplicate**.

Delete flow — use the shared `useConfirm` hook:

```tsx
const confirmed = await confirm({
    title: 'Delete blueprint?',
    message: `"${bp.title}" will be permanently removed. This cannot be undone.`,
    confirmLabel: 'Delete',
    tone: 'danger',
});
if (confirmed) await deleteBlueprintAction(bp.id);
```

Duplicate: calls `POST /api/tests/{id}/duplicate`, then refreshes the list. Show a toast: "Duplicate created — you can edit it now."

### 2.7 Blueprint list — sort and search

**File:** `src/app/blueprint/page.tsx`

Add a toolbar above the blueprint grid (same `flex-wrap` pattern as the Library page):

```tsx
<div className="flex flex-wrap items-center gap-3 mb-6">
    <Input type="text" placeholder="Search blueprints…" value={search} onChange={...} className="flex-1 min-w-[220px]" />
    <Select value={sortKey} onChange={...}>
        <option value="created_desc">Newest first</option>
        <option value="created_asc">Oldest first</option>
        <option value="updated_desc">Recently edited</option>
        <option value="duration_asc">Shortest exam</option>
        <option value="duration_desc">Longest exam</option>
    </Select>
</div>
```

Filtering/sorting is purely client-side on the already-fetched `blueprints` array (no backend change needed at current scale). Sort/search state lives in local `useState` — not the store, since it's ephemeral UI state.

```ts
const displayed = useMemo(() => {
    let list = blueprints.filter(bp =>
        bp.title.toLowerCase().includes(search.toLowerCase())
    );
    if (sortKey === 'created_desc') list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sortKey === 'created_asc')  list = [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    if (sortKey === 'updated_desc') list = [...list].sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime());
    if (sortKey === 'duration_asc') list = [...list].sort((a, b) => a.duration_minutes - b.duration_minutes);
    if (sortKey === 'duration_desc') list = [...list].sort((a, b) => b.duration_minutes - a.duration_minutes);
    return list;
}, [blueprints, search, sortKey]);
```

### Stage 2 verification

```bash
# Backend endpoints present
grep -n "duplicate\|/usage\|delete" backend/app/api/endpoints/tests.py

# Guard in place
grep -n "_assert_blueprint_mutable" backend/app/api/endpoints/tests.py

# Frontend sort/search
grep -n "sortKey\|search" src/app/blueprint/page.tsx
```

---

## Stage 3 — Safety Dialogs: Reusable `useConfirm` Hook

### 3.1 New primitive: `useConfirm`

**New file:** `src/components/ui/ConfirmDialog.tsx`

A modal dialog driven by a Promise. Usage:

```tsx
const { confirm, ConfirmDialog } = useConfirm();

// in render:
<ConfirmDialog />

// in handler:
const ok = await confirm({ title: 'Go back?', message: '...', confirmLabel: 'Leave', tone: 'warning' });
if (ok) router.push('/blueprint');
```

Implementation: `useConfirm` returns `{ confirm, ConfirmDialog }`. `confirm()` returns a Promise that resolves `true` (user confirmed) or `false` (user cancelled). `ConfirmDialog` renders a modal overlay only when a confirmation is pending.

```tsx
interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;   // default "Confirm"
    cancelLabel?: string;    // default "Cancel"
    tone?: 'danger' | 'warning' | 'neutral';  // default 'neutral'
}

export function useConfirm() {
    const [state, setState] = useState<{
        options: ConfirmOptions;
        resolve: (v: boolean) => void;
    } | null>(null);

    const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => setState({ options, resolve }));
    }, []);

    const handleClose = useCallback((value: boolean) => {
        state?.resolve(value);
        setState(null);
    }, [state]);

    const ConfirmDialogEl = state ? (
        <ConfirmDialogModal options={state.options} onClose={handleClose} />
    ) : null;

    return { confirm, ConfirmDialog: ConfirmDialogEl };
}
```

`ConfirmDialogModal` uses the existing `Button` primitive, themed border/bg tokens for the tone, and a dark overlay. Keyboard: Enter = confirm, Escape = cancel.

Export from `components/ui/index.ts`.

### 3.2 Blueprint editor — back button fix + unsaved confirmation

**File:** `src/app/blueprint/page.tsx`

**Bug fix (issue #14):** When already on `/blueprint` (editing a new blueprint with no `?id=`), `router.push('/blueprint')` is a no-op. Fix:

```tsx
const handleBackToList = async () => {
    // Check unsaved state
    if (isDirty) {
        const ok = await confirm({
            title: 'Leave without saving?',
            message: 'Your blueprint changes have not been saved. They will be lost if you leave.',
            confirmLabel: 'Leave',
            tone: 'warning',
        });
        if (!ok) return;
    }
    setLastEditingId(null);
    resetCurrent();
    // Force re-render of list view regardless of current URL
    if (router && typeof window !== 'undefined') {
        router.push('/blueprint');
        // If already on /blueprint, the push won't re-mount.
        // Use store state instead: show list when currentBlueprint is null.
    }
};
```

The real fix is to track whether we're in "list mode" vs "editor mode" via store, not URL alone. Add `viewMode: 'list' | 'editor'` to `useBlueprintStore`. `handleCreateNew` sets `viewMode: 'editor'`. `handleBackToList` sets `viewMode: 'list'` and calls `resetCurrent()`. The page renders the list when `viewMode === 'list'` (regardless of URL), and the editor when `viewMode === 'editor'` or `idFromUrl` is present.

**`isDirty` definition for blueprints:** Store a `savedSnapshot` of the blueprint when it is fetched or successfully saved. `isDirty = JSON.stringify(currentBlueprint) !== JSON.stringify(savedSnapshot)`.

### 3.3 Authoring workbench — back button confirmation

**File:** `src/app/author/page.tsx`

The store already has `isDirty` from Epoch 7.7. Add confirm on the Back button:

```tsx
const handleBack = async () => {
    if (isDirty) {
        const ok = await confirm({
            title: 'Leave without saving?',
            message: 'You have unsaved changes in this question. They will be lost if you leave.',
            confirmLabel: 'Leave',
            tone: 'warning',
        });
        if (!ok) return;
    }
    setLastEditingLoId(null);
    if (fromBlueprint && blueprintId) {
        router.push(`/blueprint?id=${blueprintId}`);
    } else {
        router.push('/items');
    }
};
```

Also gate the `beforeunload` event:

```tsx
useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
}, [isDirty]);
```

### Stage 3 verification

- Open a new blueprint, type a title, click "← All Blueprints" → confirm dialog appears. Cancel = stays. Confirm = goes to list.
- Open blueprint with `?id=xxx`, make a change, click back → confirm dialog.
- Open an item in authoring, change something, click back → confirm dialog.
- Unsaved blueprint back button navigates correctly even when URL is already `/blueprint`.
- New `ConfirmDialog` primitive exported from `components/ui/index.ts`.

---

## Stage 4 — TimePicker: 1-Minute Increments

**File:** `src/components/ui/TimePicker.tsx`

The `step` prop defaults to `5` (line 9, line 107). Change both defaults to `1`:

```tsx
step?: number; // minute increment, default 1
...
export function TimePicker({ value, onChange, step = 1 }: TimePickerProps) {
```

The rest of the component is parametric — `minuteCount`, `minutes`, `minuteIndex` are all computed from `step`, so they automatically produce 60 entries when `step = 1`.

**Visual concern:** 60 minute entries in the 3-item spinner window will be fine since only 3 are visible at a time. The user scrolls/wheels through them. No UI change needed beyond the default.

**File:** Wherever `<TimePicker>` is called with an explicit `step={5}` — grep and remove those overrides:

```bash
grep -rn "TimePicker" src/ | grep "step="
```

Remove any explicit `step={5}` props so they pick up the new default.

### Stage 4 verification

- Open "Schedule Session" form → minute column shows 0, 1, 2, 3, 4… (not 0, 5, 10…).
- Scroll through minutes → smooth, no jumps.

---

## Stage 5 — QuestionPickerModal: Truncation + Add Button Visibility

**File:** `src/components/blueprint/QuestionPickerModal.tsx`

### 5.1 Truncate question stems in the list

Line 193 currently uses `truncate` which cuts to one line. Replace with a 3-line clamp:

```tsx
<p className="line-clamp-3 text-sm font-medium text-foreground leading-snug">
    {item.latest_content_preview || 'No preview'}
</p>
```

This gives 2–3 lines of context per question and still cuts off long stems cleanly.

### 5.2 Fix the "Add" button being off-screen

The modal list item layout currently has the content filling the full width with no guaranteed space for the action button. Make the row a `flex items-start` with the button fixed-width and `shrink-0`:

```tsx
<div className="flex items-start gap-3 p-3">
    {/* Left: content grows */}
    <div className="min-w-0 flex-1 space-y-1">
        <p className="line-clamp-3 text-sm font-medium text-foreground leading-snug">
            {item.latest_content_preview}
        </p>
        <div className="flex items-center gap-2">
            <Badge tone="neutral" size="sm">{item.latest_question_type}</Badge>
            {/* other badges */}
        </div>
    </div>
    {/* Right: button never gets pushed off */}
    <div className="shrink-0 flex flex-col items-end gap-1">
        <Button variant="primary" size="sm" onClick={() => onSelect(item)}>
            Add
        </Button>
        <button onClick={() => setInspectedItem(item)} className="text-xs text-shell-muted hover:text-foreground focus-ring rounded">
            Details
        </button>
    </div>
</div>
```

### Stage 5 verification

- Open blueprint editor → Add Specific Item → questions show 2–3 lines each.
- Scroll through a long list → "Add" button always visible on the right.
- Very long question stems (200+ chars) clamp to 3 lines without overflow.

---

## Stage 6 — Practice Exam Completion Screen

### 6.1 Pass `session_mode` to `SubmissionConfirmation`

**File:** `src/app/exam/[id]/page.tsx`

`currentSession.session_mode` is already in the store (field `session_mode: 'ASSIGNED' | 'PRACTICE'`). Pass it:

```tsx
<SubmissionConfirmation
    submittedAt={currentSession.submitted_at}
    returnPath={currentSession.return_path}
    mode={currentSession.session_mode}
/>
```

### 6.2 Two distinct completion UIs

**File:** `src/components/exam/SubmissionConfirmation.tsx`

Add `mode: 'ASSIGNED' | 'PRACTICE'` to props and render a completely different layout for practice:

**PRACTICE completion:**

```
┌─────────────────────────────────────┐
│   🧪  Practice Run Complete         │
│                                     │
│   This was a practice session —     │
│   your answers were NOT submitted   │
│   for grading.                      │
│                                     │
│   Practice sessions help you:       │
│   ✓ Familiarise yourself with       │
│     the question format             │
│   ✓ Check the time pressure         │
│   ✓ Identify knowledge gaps         │
│                                     │
│   [  Back to Blueprint  ]           │
│                                     │
│   Duration: 12 minutes              │
└─────────────────────────────────────┘
```

- Icon: beaker/lab icon (🧪 or a custom SVG), themed blue/brand (not emerald green)
- Title: "Practice Run Complete" (not "Exam Submitted Successfully")
- Explicit note: "This was a practice session — not submitted for grading"
- No "Results will be available" footer (irrelevant for practice)
- Different button label: "Back to Blueprint"

**ASSIGNED completion:** existing green checkmark UI unchanged.

```tsx
if (mode === 'PRACTICE') {
    return <PracticeCompletionScreen returnPath={returnPath} submittedAt={submittedAt} />;
}
// existing ASSIGNED UI follows...
```

Extract `PracticeCompletionScreen` as a sibling component in the same file.

### Stage 6 verification

- Start a practice exam from a blueprint → submit → see "Practice Run Complete" screen with blue/brand icon.
- Start an assigned exam as a student → submit → see existing green "Exam Submitted Successfully" screen.
- Return path links work on both screens.

---

## Stage 7 — Grading Tab: Light-Theme Color Fix

**File:** `src/app/grading/[sessionId]/page.tsx`

The following hardcoded dark-mode-only color patterns must be migrated to token-based equivalents:

| Current | Replacement | Context |
|---|---|---|
| `bg-emerald-950/40 border-emerald-800/60` | `bg-[var(--color-success-bg)] border-[var(--color-success-border)]` | Correct answer card background |
| `text-emerald-400` (correct label) | `text-[var(--color-success-fg)]` | "✓ CORRECT" label |
| `text-red-400` (incorrect label) | `text-[var(--color-danger-fg)]` | "✗ INCORRECT" label |
| `bg-red-950/40 border-red-800/60` | `bg-[var(--color-danger-bg)] border-[var(--color-danger-border)]` | Incorrect answer card |
| `bg-emerald-900/40 text-emerald-300` | `bg-[var(--color-success-bg)] text-[var(--color-success-fg)]` | Correct option chip |
| `border-emerald-700 bg-emerald-950/30 text-emerald-200` | `border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-fg)]` | MCQ correct option row |
| `border-red-700 bg-red-950/30 text-red-200` | `border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)]` | MCQ incorrect selection |
| `text-emerald-400` (✓ Graded) | `text-[var(--color-success-fg)]` | Graded question number badge |
| `bg-emerald-900/60 text-emerald-400` | `bg-[var(--color-success-bg)] text-[var(--color-success-fg)]` | Graded number circle |
| `bg-amber-900/40 text-amber-400` | `bg-[var(--color-warning-bg)] text-[var(--color-warning-fg)]` | Pending number circle |
| `bg-emerald-900/50 text-emerald-300` (PASS badge) | `<Badge tone="success" size="sm">PASS</Badge>` | Pass/fail badge |
| `bg-red-900/50 text-red-300` (FAIL badge) | `<Badge tone="danger" size="sm">FAIL</Badge>` | Pass/fail badge |
| `text-blue-400` (percentage) | `text-brand` | Score percentage |
| `bg-red-900/30 border border-red-700 text-red-300` (error banner) | `border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)]` | Error banner |
| `border-emerald-900/60` (graded card border) | `border-[var(--color-success-border)]` | Graded question card |
| `prose-invert` on content inside graded view | Check theme — may need `[data-theme="warm"] .prose` override or switch to `prose` without `prose-invert` on light themes | Question content rendering |

After migration, run:

```bash
grep -E "text-(emerald|red|blue|amber)-[0-9]+|bg-(emerald|red|amber|blue)-(9[0-9][0-9]|[0-9]{3})" \
    src/app/grading/\[sessionId\]/page.tsx
```

Expected: 0 matches.

### Stage 7 verification

- Grade a submitted session. Open on `light-blue` theme: "✓ CORRECT" label is readable green, "✗ INCORRECT" is readable red, PASS/FAIL badge visible.
- Verify on all 3 themes (dark / warm / light-blue).

---

## Stage 8 — Analytics InfoTooltip: Z-Index & Clipping Fix

**File:** `src/components/ui/InfoTooltip.tsx`

**Root cause:** The tooltip `<span>` is positioned `absolute` with `z-50` inside a parent that has `overflow: hidden` or is inside a `sticky` element that creates a new stacking context. `z-50` is relative to the stacking context, not the document root.

**Fix — portal approach:** Render the tooltip content via a React portal into `document.body`, similar to how the `ToastProvider` works. This escapes all parent overflow/z-index constraints.

```tsx
import { createPortal } from 'react-dom';

export default function InfoTooltip({ children, label = 'More info', className }: InfoTooltipProps) {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => { setMounted(true); }, []);

    function openTooltip() {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        setCoords({
            top: rect.bottom + window.scrollY + 8,
            left: rect.left + window.scrollX,
        });
        setOpen(true);
    }

    // ... close on outside click / Escape (same as before)

    const tooltip = open && mounted ? createPortal(
        <span
            role="tooltip"
            style={{ position: 'absolute', top: coords.top, left: coords.left, zIndex: 9999 }}
            className="w-72 rounded-lg border border-shell-border bg-shell-surface shadow-elevated px-3 py-2.5 text-meta text-foreground leading-relaxed pointer-events-auto"
        >
            {children}
        </span>,
        document.body
    ) : null;

    return (
        <span className={cn('relative inline-flex', className)}>
            <button ref={triggerRef} type="button" aria-label={label} onClick={openTooltip} ... >
                i
            </button>
            {tooltip}
        </span>
    );
}
```

This guarantees the tooltip always renders above everything regardless of parent stacking contexts.

### Stage 8 verification

- Open `/analytics/tests/<id>`. Click `(i)` on "Median", "Pass Rate", "Cronbach's α". Tooltip appears fully visible, not clipped, on top of all other content.
- Click outside → closes. Escape → closes.
- Works on all three themes.

---

## Stage 9 — Home Screen: Animated Redesign + Remove Credentials

### 9.1 Remove hardcoded credentials

**File:** `src/app/page.tsx`

Delete the entire "Test Environment Access" credentials card block (the three role boxes with email/password). These were dev scaffolding and have no place in a production-facing UI.

Replace with a simple "Go to Login" CTA. The dev credentials are in `.env` and the `CLAUDE.md` — they don't need to be on-screen.

### 9.2 New animated home screen

**File:** `src/app/page.tsx`

Full rewrite using only Tailwind utilities + CSS animations via `@keyframes` in `globals.css`. No external animation libraries.

**Layout concept:** Dark full-bleed canvas. Centered vertically and horizontally. Three layered elements:
1. A subtle animated gradient mesh in the background (CSS `@keyframes` on pseudo-elements or a `div` with `animate-pulse`-like custom animation).
2. The OpenVision wordmark and tagline.
3. A single prominent CTA button to `/login`.
4. A small feature list below the CTA (3 icons + labels: "Adaptive Assessment", "Psychometric Analytics", "Secure Exam Delivery").

**Animations:**
- On mount: title fades in + slides up (`opacity-0 translate-y-4` → `opacity-100 translate-y-0` via CSS transition triggered by a `mounted` state flag).
- Gradient background: slow, looping `@keyframes gradientShift` that rotates hue slightly — subtle, not distracting.
- CTA button: gentle pulse ring on hover.

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Home() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { const t = setTimeout(() => setMounted(true), 50); return () => clearTimeout(t); }, []);

    return (
        <div className="relative min-h-screen bg-shell-bg overflow-hidden flex flex-col items-center justify-center px-6 text-center">
            {/* Animated background blobs */}
            <div className="pointer-events-none absolute inset-0" aria-hidden>
                <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-brand/10 blur-[120px] animate-blob" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-brand/8 blur-[100px] animate-blob animation-delay-2000" />
            </div>

            {/* Content */}
            <div
                className={`relative z-10 max-w-2xl transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
            >
                {/* Logo mark */}
                <div className="flex items-center justify-center gap-3 mb-8">
                    <span className="w-3 h-3 rounded-full bg-brand animate-pulse" />
                    <span className="text-eyebrow tracking-eyebrow text-shell-muted uppercase">OpenVision</span>
                </div>

                <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-foreground mb-4 leading-tight">
                    Academic Assessment,<br />
                    <span className="text-brand">Reimagined.</span>
                </h1>

                <p className="text-lg text-shell-muted mb-10 leading-relaxed">
                    Psychometrically sound. Beautifully designed. Built for the modern university.
                </p>

                <Link
                    href="/login"
                    className="inline-flex items-center gap-2 bg-brand hover:bg-brand/90 text-white font-semibold px-8 py-4 rounded-xl text-base transition-all hover:scale-[1.02] hover:shadow-[0_0_32px_var(--color-brand)] focus-ring"
                >
                    Sign in to OpenVision →
                </Link>

                {/* Feature pills */}
                <div className="mt-12 flex flex-wrap justify-center gap-4 text-sm text-shell-muted">
                    {[
                        { icon: '📐', label: 'Adaptive Blueprints' },
                        { icon: '📊', label: 'Psychometric Analytics' },
                        { icon: '🔒', label: 'Secure Exam Delivery' },
                    ].map(f => (
                        <span key={f.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-shell-border bg-shell-surface/50">
                            {f.icon} {f.label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
```

**File:** `src/app/globals.css`

Add the blob animation:

```css
@keyframes blob {
    0%, 100% { transform: scale(1) translate(0, 0); }
    33%       { transform: scale(1.05) translate(2%, -2%); }
    66%       { transform: scale(0.97) translate(-2%, 2%); }
}
.animate-blob { animation: blob 12s ease-in-out infinite; }
.animation-delay-2000 { animation-delay: 2s; }
```

### Stage 9 verification

- `/` shows no email/password credentials.
- Animation plays on mount (fade + translate).
- Background blobs animate gently — no jank, no CPU spike.
- CTA button links to `/login`.
- Feature pills render on all 3 themes (token-bound).
- `tsc --noEmit` passes (no type errors from the new page).

---

## Stage 10 — Verification

### 10.1 Type + build

```bash
cd frontend
npx tsc --noEmit
npx next build
```

### 10.2 Cleanliness greps

```bash
# Stage 1 — import nav gone, bank selector gone
grep -n "'Import'" src/components/layout/GlobalHeader.tsx
grep -n "bankId\|fetchBanks" src/app/import/page.tsx

# Stage 1 — SUBJECT keyword present
grep -rn "SUBJECT" backend/app/services/import_service/lexer.py frontend/public/import-template.txt

# Stage 2 — guard in place
grep -n "_assert_blueprint_mutable" backend/app/api/endpoints/tests.py

# Stage 3 — confirm hook used
grep -rn "useConfirm\|ConfirmDialog" src/app/blueprint/page.tsx src/app/author/page.tsx

# Stage 4 — step=5 gone
grep -rn "step={5}" src/

# Stage 7 — hardcoded grading colors gone
grep -E "text-(emerald|red|amber)-[0-9]+|bg-(emerald|red|amber|blue)-9" src/app/grading/\[sessionId\]/page.tsx

# Stage 8 — portal in InfoTooltip
grep -n "createPortal" src/components/ui/InfoTooltip.tsx

# Stage 9 — credentials gone
grep -n "adminpass\|conpass\|studentpass" src/app/page.tsx
```

### 10.3 Manual check matrix

| Screen | dark | warm | light-blue |
|---|---|---|---|
| Home page (animation) | ✓ | ✓ | ✓ |
| Import (entry from Library) | ✓ | ✓ | ✓ |
| Import (entry from Blueprints) | ✓ | ✓ | ✓ |
| Blueprint list (sort/search/badges) | ✓ | ✓ | ✓ |
| Blueprint editor (back confirm) | ✓ | ✓ | ✓ |
| Authoring (back confirm) | ✓ | ✓ | ✓ |
| Schedule session (minute picker) | ✓ | ✓ | ✓ |
| QuestionPickerModal (truncated, Add visible) | ✓ | ✓ | ✓ |
| Practice exam completion | ✓ | ✓ | ✓ |
| Assigned exam completion | ✓ | ✓ | ✓ |
| Grading detail | ✓ | ✓ | ✓ |
| Analytics InfoTooltips | ✓ | ✓ | ✓ |

### 10.4 Backend tests

```bash
cd backend
source .venv/bin/activate
PYTHONPATH=. pytest tests/unit/ -v           # import parser — still 15/15
PYTHONPATH=. pytest tests/test_schemas.py -v  # existing schemas
```

### 10.5 Aikido scan

Zero new Critical/High findings before merge.

---

## Files Touched (estimate)

**Backend (~2 files):**
- `backend/app/api/endpoints/tests.py` — `_assert_blueprint_mutable`, delete endpoint, duplicate endpoint, usage endpoint
- `backend/app/api/endpoints/import_endpoints.py` — remove bank selector, auto-resolve bank
- `backend/app/services/import_service/lexer.py` — add SUBJECT keyword
- `backend/app/services/import_service/assembler.py` — handle SUBJECT
- `backend/app/services/import_service/validator.py` — TAGS deprecation warning
- `backend/app/services/import_service/persister.py` — remove bank_id param, auto-resolve

**Frontend (~18 files):**
- `src/app/page.tsx` — full rewrite (home screen)
- `src/app/import/page.tsx` — bank removal, button rename, mode cards, guide button, exit warning
- `src/app/blueprint/page.tsx` — sort/search, lock badges, delete, duplicate, back fix, confirm
- `src/app/author/page.tsx` — back confirm
- `src/app/items/page.tsx` — Import entry point button
- `src/app/grading/[sessionId]/page.tsx` — token migration
- `src/app/exam/[id]/page.tsx` — pass `mode` to SubmissionConfirmation
- `src/components/exam/SubmissionConfirmation.tsx` — practice screen
- `src/components/blueprint/QuestionPickerModal.tsx` — truncation, Add button layout
- `src/components/layout/GlobalHeader.tsx` — remove Import link
- `src/components/ui/ConfirmDialog.tsx` — new primitive
- `src/components/ui/InfoTooltip.tsx` — portal refactor
- `src/components/ui/TimePicker.tsx` — default step=1
- `src/components/ui/index.ts` — export ConfirmDialog
- `src/components/import/FormatGuideModal.tsx` — SUBJECT rename, guide prominence
- `src/stores/useImportStore.ts` — remove bank, add persist
- `src/stores/useBlueprintStore.ts` — usageMap, delete, duplicate, viewMode, savedSnapshot
- `frontend/public/import-template.txt` — rewrite
- `src/app/globals.css` — blob animation keyframes

**Directives:**
- `directives/epoch_8_1_blueprint.md` (this file)
- `directives/epoch_roadmap.md` (Epoch 8.1 entry added)

---

## Out of Scope (deferred)

- Backend pagination for blueprint list (current scale does not require it).
- Bulk blueprint delete.
- Per-blueprint analytics roll-up on the list card.
- Animated transitions between list ↔ editor views (CSS route transitions — needs Next.js View Transitions API, not yet stable).
- AI-assisted question generation from the import page.
- QTI / CSV import formats.

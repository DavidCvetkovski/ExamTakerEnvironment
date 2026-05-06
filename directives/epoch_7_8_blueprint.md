# Epoch 7.8 Blueprint — Navigation Persistence, Sessions Overhaul, TimePicker Fix & UI Audit

> **Branch:** `feature/epoch-7-8-polish`
> **Prerequisites:** Epoch 7.7 merged to `main`.
> **Scope:** Frontend-only with one minor backend schema touch (bulk-enroll endpoint).
> **CLAUDE.md principles in play:** Separation of concerns, modularity, no dead code, security (input validation), scalability (URL-as-truth over localStorage).

---

## Progress Checklist

- [x] Stage 1 — Navigation Architecture & State Persistence
- [x] Stage 2 — Sessions Page Overhaul (3 sections, timers, cancel confirmation)
- [x] Stage 3 — TimePicker Redesign (fix scroll bug, desktop-friendly)
- [x] Stage 4 — Sessions Form Polish (course display, creation feedback, bulk enrollment)
- [x] Stage 5 — Blueprint Creation Polish (modal theming, breakdown layout, label cleanup)
- [x] Stage 6 — Grading & Publishing Flow Fix
- [x] Stage 7 — Analytics Fixes (theme buttons, column audit, tag contrast)
- [x] Stage 8 — Question Library Filters + Authoring Partial Points
- [x] Stage 9 — Theme & Button Audit (Practice, Enrollments, student grade view)
- [x] Stage 10 — Verification (tsc ✅, next build ✅)
- [x] Issue #30 — Sign out bug (hotfixed, not a full stage)

---

## Issues Catalogue

| # | Issue | Stage |
|---|---|---|
| 1 | Authoring bench is a nav tab — should only be reachable from Library | 1 |
| 2 | Analytics: switching tabs resets to overview, not to the last open test | 1 |
| 3 | Blueprint: switching tabs resets to overview, not to the editing state | 1 |
| 4 | Sessions page: all sessions in one unsorted table | 2 |
| 5 | No live countdown timer for upcoming/ongoing sessions | 2 |
| 6 | No cancel confirmation dialog | 2 |
| 7 | No meaningful feedback when a session is scheduled | 2 |
| 8 | TimePicker scroll is buggy and jittery on desktop | 3 |
| 9 | TimePicker UX unintuitive for desktop (scroll-based) | 3 |
| 10 | Course dropdown shows course code — should show title only | 4 |
| 11 | No feedback when creating a course as admin | 4 |
| 12 | No bulk enrollment via pasted email list | 4 |
| 13 | QuestionPickerModal does not follow active theme | 5 |
| 14 | Live breakdown causes horizontal overflow | 5 |
| 15 | "Complexity" label unclear | 5 |
| 16 | "Manual duration" should be "Duration" | 5 |
| 17 | Blueprint back-navigation loses editing state | 5 |
| 18 | Unpublish grays out publish button | 6 |
| 19 | Grades auto-publish; should require explicit action | 6 |
| 20 | Analytics top-section buttons ignore theme | 7 |
| 21 | "Version" column in analytics item list is noise | 7 |
| 22 | "Revision quality flags" section not needed | 7 |
| 23 | Poor Discrimination / Latest tags near-invisible in light themes | 7 |
| 24 | Question Library: no filter by points or type | 8 |
| 25 | MCQ authoring: no partial points toggle visible | 8 |
| 26 | "Back to blueprints" button broken in authoring | 8 |
| 27 | Practice button unreadable in light themes | 9 |
| 28 | Enrollments button loses border in light themes | 9 |
| 29 | Student grade view dark theme broken | 9 |
| 30 | Sign out bugs out (interceptor loop + no immediate redirect) | ✅ hotfixed |

---

## Issue #30 — Sign Out Bug ✅ Hotfixed

**Root causes (three separate bugs compounding each other):**

1. **401 interceptor loop.** `auth/logout` was not excluded from the response interceptor's retry logic. If the access token had already expired by the time the user clicked Sign out, the interceptor caught the 401 from the logout endpoint, tried to refresh the token, refresh also failed, then called `logout()` again — infinite loop / crash.

2. **Logout waited on the network before clearing state.** The `finally` block in `logout` ran only after `await api.post('auth/logout')` resolved or rejected. If the request hung (e.g. slow network), the UI showed the user as still authenticated for several seconds.

3. **Navigation relied entirely on `ProtectedRoute`'s `useEffect`.** After state was cleared, the redirect to `/login` depended on a child component's effect re-running — which is asynchronous and can be delayed by React's scheduler, causing a visible flash of the authenticated page.

**Files changed:**

- `src/lib/api.ts` — added `auth/logout` to the 401 interceptor exclusion list alongside `auth/refresh` and `auth/login`
- `src/stores/useAuthStore.ts` — `logout` is now synchronous: clears Zustand state immediately, fires `api.post('auth/logout')` as fire-and-forget (no `await`, no `try/catch` that blocks)
- `src/components/layout/GlobalHeader.tsx` — `handleSignOut` calls `logout()` then immediately `router.push('/login')` — no dependency on `ProtectedRoute` for navigation

---

## Stage 1 — Navigation Architecture & State Persistence

### 1.1 Remove "Authoring" from the nav bar

**File:** `src/components/layout/GlobalHeader.tsx`

The authoring bench is a tool you enter from the Library, not a destination in itself. Remove it from `navLinks` for non-student roles. Entry point stays `<Button onClick={() => router.push('/author?lo_id=...')}` inside `items/page.tsx`.

```ts
// Before
{ name: 'Sessions', href: '/sessions' },
{ name: 'Blueprints', href: '/blueprint' },
{ name: 'Library', href: '/items' },
{ name: 'Authoring', href: '/author' },   // ← remove this line
{ name: 'Grading', href: '/grading' },
{ name: 'Analytics', href: '/analytics' },

// After
{ name: 'Sessions', href: '/sessions' },
{ name: 'Blueprints', href: '/blueprint' },
{ name: 'Library', href: '/items' },
{ name: 'Grading', href: '/grading' },
{ name: 'Analytics', href: '/analytics' },
```

Also update the active-link matching. Currently `pathname.startsWith(link.href)` would mark Library active when on `/author` — that is now the correct behaviour since authoring is a sub-surface of Library.

### 1.2 Analytics state persistence

**Pattern:** Store the last visited test ID in `useAnalyticsStore` in memory (no localStorage — the URL is the truth, but Zustand survives tab-switches within the same browser session).

**File:** `src/stores/useAnalyticsStore.ts`

```ts
interface AnalyticsState {
  // ... existing fields ...
  lastTestId: string | null;          // ADD
  setLastTestId: (id: string | null) => void;  // ADD
}

// In create():
lastTestId: null,
setLastTestId: (id) => set({ lastTestId: id }),
```

**File:** `src/app/analytics/tests/[testId]/page.tsx`

On mount, call `setLastTestId(testId)`. On unmount (`return () => { /* do NOT clear — we want persistence */ }`).

```ts
const { setLastTestId } = useAnalyticsStore();
useEffect(() => {
    setLastTestId(testId);
    // intentionally no cleanup — keep ID for tab-switch return
}, [testId, setLastTestId]);
```

**File:** `src/app/analytics/page.tsx`

```ts
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAnalyticsStore } from '@/stores/useAnalyticsStore';

export default function AnalyticsIndexPage() {
    const router = useRouter();
    const { lastTestId, blueprints, isLoading, fetchBlueprints } = useAnalyticsStore();

    // If we were looking at a test, jump straight back to it
    useEffect(() => {
        if (lastTestId) {
            router.replace(`/analytics/tests/${lastTestId}`);
        } else {
            fetchBlueprints();
        }
    }, []); // run once on mount only — empty dep array is intentional

    // ... rest of overview render (shown when lastTestId is null)
}
```

Add a "← All tests" button inside the test page that explicitly clears `lastTestId` and navigates to `/analytics`:

```ts
<Button variant="ghost" size="sm" onClick={() => {
    setLastTestId(null);
    router.push('/analytics');
}}>
    ← All tests
</Button>
```

### 1.3 Blueprint state persistence

**File:** `src/stores/useBlueprintStore.ts`

```ts
interface BlueprintState {
  // ... existing ...
  lastEditingId: string | null;       // ADD — null means "overview"
  setLastEditingId: (id: string | null) => void; // ADD
}
```

**File:** `src/app/blueprint/page.tsx`

The page already uses `?id=` search params to determine editing vs overview. The gap is that the nav link always points to `/blueprint` (no params), dropping the user into the overview.

Two changes:

1. When `idFromUrl` is set (editing mode), call `setLastEditingId(idFromUrl)`.
2. When explicitly going to overview ("Back to Blueprints" button or "New Blueprint"), call `setLastEditingId(null)`.

```ts
useEffect(() => {
    if (idFromUrl) {
        setLastEditingId(idFromUrl);
        fetchBlueprint(idFromUrl);
        setIsEditing(true);
    } else if (lastEditingId) {
        // Nav link hit /blueprint with no id — restore editing state
        router.replace(`/blueprint?id=${lastEditingId}`);
    } else {
        fetchBlueprints();
        setIsEditing(false);
    }
}, [idFromUrl]); // only re-run when URL changes
```

The "Back to Blueprints" button in the editor must clear `lastEditingId`:

```ts
<Button variant="ghost" size="sm" onClick={() => {
    setLastEditingId(null);
    router.push('/blueprint');
}}>
    ← All Blueprints
</Button>
```

---

## Stage 2 — Sessions Page Overhaul

### 2.1 Three sections

**File:** `src/components/sessions/ScheduledSessionsTable.tsx`

Decompose the single flat table into three logical sections based on session status and timing:

```ts
const now = new Date();

const ongoing  = sessions.filter(s => s.status === 'ACTIVE');
const planned  = sessions.filter(s =>
    s.status === 'SCHEDULED' && new Date(s.starts_at) > now
);
const past     = sessions.filter(s =>
    s.status === 'CLOSED' || s.status === 'CANCELED' ||
    (s.status === 'SCHEDULED' && new Date(s.ends_at) <= now)
);
```

Render in order: `ongoing` → `planned` → `past`. Each gets its own `<SectionHeader>` and card container. Past sessions can be collapsed by default behind a "Show past sessions" disclosure toggle (HTML `<details>` or simple `useState` boolean).

### 2.2 Live countdown timers

Create a shared hook:

**File:** `src/hooks/useCountdown.ts`

```ts
import { useState, useEffect } from 'react';

function formatDuration(ms: number): string {
    if (ms <= 0) return '0s';
    const totalSeconds = Math.floor(ms / 1000);
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export function useCountdown(targetIso: string): string {
    const [display, setDisplay] = useState('');

    useEffect(() => {
        const update = () => {
            const diff = new Date(targetIso).getTime() - Date.now();
            setDisplay(formatDuration(Math.abs(diff)));
        };
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [targetIso]);

    return display;
}
```

Usage in the planned row:
```tsx
const startsIn = useCountdown(session.starts_at);
<span className="tabular-nums text-[var(--color-info-fg)]">Starts in {startsIn}</span>
```

Usage in the ongoing row:
```tsx
const endsIn = useCountdown(session.ends_at);
<span className="tabular-nums text-[var(--color-warning-fg)]">Ends in {endsIn}</span>
```

**Important:** `useCountdown` must be called unconditionally (Rules of Hooks). Extract each row into its own component (`PlannedSessionRow`, `OngoingSessionRow`) so the hook call is at the component level, not inside `.map()`.

### 2.3 Cancel confirmation modal

**File:** `src/components/sessions/CancelSessionModal.tsx` *(new)*

```tsx
'use client';

import { Button } from '@/components/ui';

interface CancelSessionModalProps {
    sessionId: string | null;   // null = closed
    onConfirm: (id: string) => Promise<void>;
    onClose: () => void;
    isBusy: boolean;
}

export default function CancelSessionModal({ sessionId, onConfirm, onClose, isBusy }: CancelSessionModalProps) {
    if (!sessionId) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-shell-border bg-shell-surface p-6 shadow-elevated">
                <h3 className="text-h3 font-semibold text-foreground">Cancel this session?</h3>
                <p className="mt-2 text-meta text-shell-muted-dim">
                    This will prevent students from joining. Already active attempts are unaffected.
                    This action cannot be undone.
                </p>
                <div className="mt-6 flex justify-end gap-3">
                    <Button variant="secondary" size="md" disabled={isBusy} onClick={onClose}>
                        Keep session
                    </Button>
                    <Button variant="destructive" size="md" disabled={isBusy} loading={isBusy}
                        onClick={() => onConfirm(sessionId)}>
                        Yes, cancel
                    </Button>
                </div>
            </div>
        </div>
    );
}
```

Wire it in `src/app/sessions/page.tsx`:

```ts
const [cancelTarget, setCancelTarget] = useState<string | null>(null);

// pass to ScheduledSessionsTable:
onRequestCancel={(id) => setCancelTarget(id)}

// render:
<CancelSessionModal
    sessionId={cancelTarget}
    onConfirm={async (id) => {
        await cancelScheduledSession(id);
        setCancelTarget(null);
        toast({ tone: 'success', title: 'Session cancelled' });
    }}
    onClose={() => setCancelTarget(null)}
    isBusy={sessionsLoading}
/>
```

### 2.4 Schedule session feedback

In `src/app/sessions/page.tsx`, wrap the `onSubmit` passed to `SessionCreateForm`:

```ts
const handleSchedule: SessionCreateFormProps['onSubmit'] = async (payload) => {
    await createScheduledSession(payload);
    toast({ tone: 'success', title: 'Session scheduled', description: 'Students can join at the set start time.' });
};
```

Pass `handleSchedule` instead of `createScheduledSession` directly.

---

## Stage 3 — TimePicker Redesign

The current scroll-based `SpinnerColumn` is fundamentally flawed on desktop because:
1. The `onScroll` handler fires asynchronously and `scrollTop` is already partway through momentum scroll when read.
2. The `useEffect` that repositions `scrollTop` on `selectedIndex` change creates a feedback loop with the scroll handler.
3. `scroll-snap` and `overflow-y: auto` interact poorly across browsers when the container height is fixed.

**Replace the scroll approach entirely** with a wheel + click pattern.

**File:** `src/components/ui/TimePicker.tsx` — full rewrite of `SpinnerColumn`:

```tsx
function SpinnerColumn({
    values,
    selectedIndex,
    onSelect,
    ariaLabel,
}: SpinnerColumnProps) {
    const prev = () => onSelect(Math.max(0, selectedIndex - 1));
    const next = () => onSelect(Math.min(values.length - 1, selectedIndex + 1));

    // Wheel scrolls through values directly — no DOM scroll involved
    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        if (e.deltaY > 0) next();
        else prev();
    };

    return (
        <div
            role="spinbutton"
            aria-label={ariaLabel}
            aria-valuenow={selectedIndex}
            aria-valuemin={0}
            aria-valuemax={values.length - 1}
            aria-valuetext={values[selectedIndex]}
            tabIndex={0}
            className="flex flex-col items-center select-none outline-none"
            onWheel={handleWheel}
            onKeyDown={(e) => {
                if (e.key === 'ArrowUp') { e.preventDefault(); prev(); }
                if (e.key === 'ArrowDown') { e.preventDefault(); next(); }
            }}
        >
            {/* Up arrow */}
            <button type="button" onClick={prev} disabled={selectedIndex === 0}
                className="flex h-7 w-full items-center justify-center text-shell-muted
                           hover:text-foreground transition-colors disabled:opacity-30"
                aria-label={`Previous ${ariaLabel}`}
            >
                ▲
            </button>

            {/* Show: previous (dimmed), current (highlighted), next (dimmed) */}
            {[-1, 0, 1].map((offset) => {
                const idx = selectedIndex + offset;
                const valid = idx >= 0 && idx < values.length;
                return (
                    <div
                        key={offset}
                        onClick={() => valid && onSelect(idx)}
                        className={[
                            'flex h-9 w-14 cursor-pointer items-center justify-center rounded-lg text-sm font-mono transition-all',
                            offset === 0
                                ? 'font-semibold scale-105'
                                : 'opacity-35 text-shell-muted text-xs scale-95',
                        ].join(' ')}
                        style={offset === 0 ? {
                            backgroundColor: 'var(--color-brand)',
                            color: 'white',
                        } : {}}
                    >
                        {valid ? values[idx] : ''}
                    </div>
                );
            })}

            {/* Down arrow */}
            <button type="button" onClick={next} disabled={selectedIndex === values.length - 1}
                className="flex h-7 w-full items-center justify-center text-shell-muted
                           hover:text-foreground transition-colors disabled:opacity-30"
                aria-label={`Next ${ariaLabel}`}
            >
                ▼
            </button>
        </div>
    );
}
```

The popover is now a fixed-height 3-item window (prev / current / next) with no DOM scrolling. The wheel event on the entire column drives selection. Keyboard works via `onKeyDown`. No `useEffect`, no `scrollTop` manipulation, no feedback loops.

Remove these from `TimePicker.tsx`:
- All `useRef` for the scroll container
- The `useEffect` that called `el.scrollTop = ...`
- The `onScroll` handler
- The `style={{ scrollSnapType: 'y mandatory' }}` and related properties
- The `scrollbar-hide scroll-smooth` classes

---

## Stage 4 — Sessions Form Polish

### 4.1 Course dropdown: title only

**File:** `src/components/sessions/SessionCreateForm.tsx`

```tsx
// Before
{course.code} - {course.title}

// After
{course.title}
```

The `course_id` submitted to the backend is unchanged. The code is internal metadata.

### 4.2 Course creation feedback

**File:** `src/components/sessions/SessionCreateForm.tsx`

Import and use `useToast`. In `handleCreateCourse`:

```ts
import { Button, DatePicker, Field, TimePicker, useToast } from '@/components/ui';

const { toast } = useToast();

const handleCreateCourse = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!courseCode.trim() || !courseTitle.trim()) return;
    setCourseBusy(true);
    try {
        await onCreateCourse({ code: courseCode.trim(), title: courseTitle.trim() });
        setCourseCode('');
        setCourseTitle('');
        toast({ tone: 'success', title: 'Course created', description: courseTitle.trim() });
    } catch (err) {
        toast({ tone: 'danger', title: 'Failed to create course',
                description: err instanceof Error ? err.message : 'Check your connection.' });
    } finally {
        setCourseBusy(false);
    }
};
```

### 4.3 Bulk email enrollment

**File:** `src/components/sessions/CourseEnrollmentDrawer.tsx`

Add a second tab/section inside the drawer: "Add one" (existing select dropdown) and "Add many" (new textarea).

```tsx
const [enrollMode, setEnrollMode] = useState<'single' | 'bulk'>('single');
const [bulkEmails, setBulkEmails] = useState('');
const [bulkResults, setBulkResults] = useState<{ email: string; status: 'ok' | 'error'; message?: string }[]>([]);
const [bulkBusy, setBulkBusy] = useState(false);

const handleBulkEnroll = async () => {
    const emails = bulkEmails
        .split(/[\n,;]+/)
        .map(e => e.trim().toLowerCase())
        .filter(e => e.includes('@'))
        .filter((e, i, arr) => arr.indexOf(e) === i); // deduplicate

    if (emails.length === 0) return;
    setBulkBusy(true);
    setBulkResults([]);

    const results = await Promise.allSettled(
        emails.map(email =>
            onAddEnrollment(course.id, { student_email: email })
                .then(() => ({ email, status: 'ok' as const }))
                .catch((err) => ({ email, status: 'error' as const,
                                   message: err?.response?.data?.detail ?? 'Unknown error' }))
        )
    );

    setBulkResults(results.map(r => r.status === 'fulfilled' ? r.value : { email: '?', status: 'error' }));
    setBulkBusy(false);
    setBulkEmails('');
};
```

UI: a `<Textarea>` with placeholder "Paste emails, one per line or comma-separated", a "Enroll all" `Button`, and below it a result list showing green ✓ / red ✗ per email.

**Backend contract check:** `onAddEnrollment` already accepts `{ student_email?: string }` per `CourseEnrollmentDrawer`'s prop type. Confirm the backend `POST /courses/{id}/enrollments` accepts `student_email` (it should — check `useCourseStore.addEnrollment`). If not, add `student_email` support to the endpoint. Document the check in the stage exit criteria.

---

## Stage 5 — Blueprint Creation Polish

### 5.1 QuestionPickerModal: theme adherence

**File:** `src/components/blueprint/QuestionPickerModal.tsx`

The modal currently uses hardcoded inline styles (`style={{ background: '#1e293b', ... }}`). Replace all of them with token-based Tailwind classes:

```tsx
// Before (example)
<div style={{ background: '#1e293b', color: 'white', borderRadius: 16, padding: 24 }}>

// After
<div className="rounded-2xl bg-shell-surface border border-shell-border p-6 text-foreground">
```

Audit every `style={{ ... }}` prop in the file and migrate:
- Background colours → `bg-shell-*` tokens
- Text colours → `text-foreground` / `text-shell-muted` / `text-shell-muted-dim`
- Border colours → `border-shell-border`
- Button styles → `Button` primitive
- Input styles → `Input` / `Select` primitive

The modal overlay:
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
```

### 5.2 Live breakdown — fix horizontal overflow

**File:** `src/app/blueprint/page.tsx`

The live breakdown panel currently renders alongside the editing form causing the page to exceed viewport width. Two acceptable solutions — pick the simpler one:

**Option A (recommended):** Move the breakdown below the editing form, inside a collapsible `<details>` disclosure:

```tsx
<details className="mt-6">
    <summary className="cursor-pointer text-sm font-semibold text-shell-muted hover:text-foreground">
        Show live breakdown
    </summary>
    <div className="mt-4">
        {/* breakdown content */}
    </div>
</details>
```

**Option B:** Render it as a collapsible right-panel only on screens ≥ 1400px, hidden below that. Use Tailwind responsive classes:
```tsx
<div className="hidden 2xl:block w-72 shrink-0">
    {/* breakdown */}
</div>
```

Either way, the main editing form must never require horizontal scroll at 1280px viewport width.

### 5.3 Label cleanup

**File:** `src/app/blueprint/page.tsx`

1. **"Complexity"** — if this refers to cognitive complexity (Bloom's level), relabel it "Cognitive level". If it refers to something else, remove it or add a `title` tooltip explaining it. Do not leave an unexplained label in the UI.

2. **"Manual duration"** — find every instance of the string `"manual"` (case-insensitive) in this file and replace:
   - `"Manual duration"` → `"Duration (minutes)"`
   - `"Manual"` standalone label → remove the word entirely

```bash
# Locate:
grep -in "manual" frontend/src/app/blueprint/page.tsx
```

### 5.4 Blueprint back-navigation fix

Already covered in Stage 1.3. The "Back to Blueprints" button must:
1. Call `setLastEditingId(null)` from the blueprint store.
2. Call `router.push('/blueprint')` (no params).

If the button currently uses `router.back()`, that is fragile (depends on browser history stack). Replace it with an explicit push.

---

## Stage 6 — Grading & Publishing Flow

### 6.1 Understand the current flow

**File:** `src/stores/useGradingStore.ts`

Read the store to understand when `published` is set. The suspected bug: toggling "Unpublish" sets some `is_published` flag to `false`, but the UI then disables the "Publish" button (perhaps checking `saveStatus === 'SAVING'` or a stale boolean).

### 6.2 Publishing rules

**Target behaviour:**
- **No auto-publish.** Scores are never visible to students automatically.
- **Publish button** is enabled when at least one session has been graded. It is never disabled by the unpublished state — only by a pending network request.
- **Unpublish button** appears only when results are currently published.
- **The two buttons are never shown simultaneously and are never mutually disabled.**

```tsx
// In the grading page or GradingResultsPanel:
const isPublished = session.results_published;   // boolean from store

{isPublished ? (
    <Button variant="secondary" size="md" onClick={handleUnpublish} loading={isPublishing}>
        Unpublish results
    </Button>
) : (
    <Button variant="primary" size="md" onClick={handlePublish} loading={isPublishing}>
        Publish results
    </Button>
)}
```

**No** conditional `disabled={isPublished}` on the Publish button. `disabled` should only be `loading={isPublishing}` (the request is in flight).

### 6.3 Backend audit

Check `POST /grading/sessions/{id}/publish` and `DELETE` (or `PATCH`) for unpublish. Confirm the backend does not auto-publish on grade submission. If it does, add a `auto_publish: false` flag or ensure the endpoint only publishes on explicit call. Document the audit in exit criteria.

---

## Stage 7 — Analytics Fixes

### 7.1 Top-section buttons: theme-aware

**File:** `src/app/analytics/tests/[testId]/page.tsx`

Grep for `<button` and inline `style={{ ... }}` or hardcoded `bg-blue-*`, `text-white`, `bg-gray-*` etc in this file. Migrate every button to the `Button` primitive or to token-based classes.

Common pattern to find and fix:
```tsx
// Before
<button className="px-4 py-2 bg-blue-600 text-white rounded-lg">Export</button>

// After
<Button variant="primary" size="sm">Export</Button>
```

### 7.2 Remove "Version" column from analytics item list

**File:** `src/components/analytics/AllItemsTable.tsx`

Remove the `<th>` for "Version" and the corresponding `<td>` rendering `v{item.version_number ?? '—'}`. The column was always a numeric label with no actionable information.

### 7.3 Remove "revision quality flags" section

**File:** `src/components/analytics/VersionCard.tsx` (if it exists) or wherever the "which revisions attracted quality flags" section lives.

Grep:
```bash
grep -rn "revision\|VersionCard\|attracted" frontend/src/components/analytics/
grep -rn "VersionCard" frontend/src/app/analytics/
```

Delete the component and remove its import/usage. It is explicitly out of scope per the issues catalogue.

### 7.4 Tag contrast fix — Poor Discrimination, Latest

**File:** `src/components/analytics/FlagBadge.tsx`

Audit the colour mapping for each flag code. The "POOR_DISCRIMINATION" and "LATEST" badges must meet WCAG AA (4.5:1) on warm and light-blue themes.

The fix is to use the existing `Badge` primitive with `tone="warning"` for POOR_DISCRIMINATION and `tone="info"` for LATEST — these tones already have opacity-bumped backgrounds from Epoch 7.7.

```tsx
const FLAG_TONE: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
    TOO_EASY: 'info',
    TOO_HARD: 'danger',
    POOR_DISCRIMINATION: 'warning',   // was likely a custom hardcoded colour
    UNDERPERFORMING: 'danger',
    LATEST: 'neutral',                // was likely custom
};

export default function FlagBadge({ code }: { code: string }) {
    const label = code.replaceAll('_', ' ');
    const tone = FLAG_TONE[code] ?? 'neutral';
    return <Badge tone={tone} size="sm">{label}</Badge>;
}
```

---

## Stage 8 — Question Library Filters + Authoring Partial Points

### 8.1 Points filter in Question Library

**File:** `src/app/items/page.tsx`

Add a points range filter. The existing filter bar has search + subject. Add:

```tsx
const [pointsFilter, setPointsFilter] = useState<'all' | '1' | '2' | '3+'>('all');

// In filteredItems:
const matchesPoints = pointsFilter === 'all' ? true :
    pointsFilter === '3+' ? (getMetadataNumber(item.metadata_tags?.points) ?? 1) >= 3 :
    String(getMetadataNumber(item.metadata_tags?.points) ?? 1) === pointsFilter;

// UI:
<Select inputSize="md" value={pointsFilter} onChange={(e) => setPointsFilter(e.target.value as typeof pointsFilter)}>
    <option value="all">All points</option>
    <option value="1">1 point</option>
    <option value="2">2 points</option>
    <option value="3+">3+ points</option>
</Select>
```

### 8.2 Type filter in Question Library

Already has subject filter. Add type filter alongside it:

```tsx
const [typeFilter, setTypeFilter] = useState<'all' | 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'ESSAY'>('all');

// In filteredItems:
const matchesType = typeFilter === 'all' || item.latest_question_type === typeFilter;

// UI:
<Select inputSize="md" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
    <option value="all">All types</option>
    <option value="MULTIPLE_CHOICE">Single choice</option>
    <option value="MULTIPLE_RESPONSE">Multiple choice</option>
    <option value="ESSAY">Essay</option>
</Select>
```

### 8.3 Partial points toggle in MCQ authoring

**Files:**
- `src/components/editor/MCQOptionsPanel.tsx`
- `src/stores/useAuthoringStore.ts`

**What partial points means:** In MULTIPLE_RESPONSE mode, each correct option contributes `1/n` of the total points by default. With partial points OFF, it's all-or-nothing. The flag lives on the options payload.

**Store change:**

```ts
// In AuthoringState:
partialPoints: boolean;
setPartialPoints: (on: boolean) => void;
```

```ts
// In saveDraft(), for MULTIPLE_RESPONSE:
optionsPayload = {
    question_type: 'MULTIPLE_RESPONSE',
    choices: Array.isArray(state.options) ? state.options : [],
    partial_credit: state.partialPoints,  // sent to backend
};
```

**UI in MCQOptionsPanel.tsx:** Show the toggle only when `questionType === 'MULTIPLE_RESPONSE'`:

```tsx
{questionType === 'MULTIPLE_RESPONSE' && (
    <label className="flex items-center gap-3 cursor-pointer">
        <input
            type="checkbox"
            checked={partialPoints}
            onChange={(e) => setPartialPoints(e.target.checked)}
            className="w-4 h-4 accent-brand"
        />
        <span className="text-meta text-foreground">Partial credit</span>
        <span className="text-meta text-shell-muted-dim">
            (award proportional marks per correct option selected)
        </span>
    </label>
)}
```

### 8.4 Fix "Back to Blueprints" button in Authoring

**File:** `src/app/author/page.tsx`

The current "Back to Library" button navigates to `/items`. If the user entered the authoring bench from a blueprint context (via a `from=blueprint&blueprint_id=...` search param), the back button should return to the blueprint editor.

Add a `from` search param check:

```ts
const fromBlueprint = searchParams.get('from') === 'blueprint';
const blueprintId = searchParams.get('blueprint_id');

// Back button:
<button onClick={() => {
    if (fromBlueprint && blueprintId) {
        router.push(`/blueprint?id=${blueprintId}`);
    } else {
        router.push('/items');
    }
}}>
    {fromBlueprint ? '← Back to Blueprint' : '← Back to Library'}
</button>
```

In `src/app/blueprint/page.tsx`, when navigating to the author for a specific item within a blueprint, append the params:
```ts
router.push(`/author?lo_id=${item.id}&from=blueprint&blueprint_id=${currentBlueprint.id}`);
```

---

## Stage 9 — Theme & Button Audit

### 9.1 Practice button in light themes

**File:** `src/components/sessions/ScheduledSessionsTable.tsx`

Find the Practice button. It likely has `bg-white text-gray-900` or `bg-cyan-*` which renders fine in dark but vanishes on light backgrounds. Migrate:

```tsx
// Before (example)
<button className="rounded-xl bg-white/10 text-white px-3 py-2 text-xs">Practice</button>

// After
<Button variant="secondary" size="sm" onClick={() => onPractice(session.test_definition_id)}>
    Practice
</Button>
```

The `Button` primitive's `secondary` variant uses shell tokens and adapts to all themes.

### 9.2 Enrollments button border in light themes

**File:** `src/components/sessions/ScheduledSessionsTable.tsx`

The button likely has `border-white/20` which is invisible on a light background. Fix:

```tsx
// Before
<button className="border border-white/20 ...">Enrollments</button>

// After
<Button variant="secondary" size="sm" onClick={() => onManageEnrollments(session.course_id)}>
    Enrollments
</Button>
```

### 9.3 Full button audit in ScheduledSessionsTable

Run:
```bash
grep -n "<button\|className.*bg-\|className.*text-white\|className.*border-white" \
  frontend/src/components/sessions/ScheduledSessionsTable.tsx
```

Every `<button>` element found must be replaced with the `Button` primitive. No raw `<button>` with hardcoded color classes should remain.

### 9.4 Student grade view dark theme

**File:** `src/app/my-results/[sessionId]/page.tsx`

The page likely renders with hardcoded `text-gray-*` or `bg-white` values. Run:

```bash
grep -n "text-gray\|bg-white\|text-black\|bg-gray" frontend/src/app/my-results/[sessionId]/page.tsx
```

Migrate every match to token-based utilities:
- `text-gray-900` → `text-foreground`
- `text-gray-500` / `text-gray-600` → `text-shell-muted`
- `text-gray-400` → `text-shell-muted-dim`
- `bg-white` → `bg-shell-surface`
- `bg-gray-50` / `bg-gray-100` → `bg-shell-bg`
- `border-gray-200` → `border-shell-border`

---

## Stage 10 — Verification

### Automated

```bash
npx tsc --noEmit           # must exit 0
npx next build             # must exit 0
```

### Sanity greps

```bash
# No hardcoded palette colours remaining in the main surfaces touched
grep -rn "bg-white\|bg-gray-\|text-gray-\|text-white\|bg-cyan-\|bg-blue-\|bg-amber-\|text-cyan-\|border-white/" \
  frontend/src/components/sessions/ \
  frontend/src/app/my-results/ \
  frontend/src/components/analytics/ \
  frontend/src/app/blueprint/page.tsx

# Authoring removed from nav
grep -n "Authoring" frontend/src/components/layout/GlobalHeader.tsx
# Expected: zero matches

# No raw <button> elements in ScheduledSessionsTable
grep -n "<button" frontend/src/components/sessions/ScheduledSessionsTable.tsx
# Expected: zero matches

# No scrollTop / scroll-snap in TimePicker
grep -n "scrollTop\|scroll-snap\|scrollbar-hide" frontend/src/components/ui/TimePicker.tsx
# Expected: zero matches
```

### Manual check matrix

| Surface | Dark | Warm | Light-blue |
|---|---|---|---|
| Sessions: 3 sections render correctly | ✓ | ✓ | ✓ |
| Countdown timers live-update | ✓ | ✓ | ✓ |
| Cancel confirmation appears before cancelling | ✓ | ✓ | ✓ |
| Schedule session → success toast | ✓ | ✓ | ✓ |
| TimePicker: no jitter on scroll/wheel | ✓ | ✓ | ✓ |
| Course dropdown shows title only | ✓ | ✓ | ✓ |
| Bulk enroll: paste emails, see per-email result | ✓ | ✓ | ✓ |
| Blueprint picker modal uses theme colours | ✓ | ✓ | ✓ |
| Blueprint: no horizontal scroll at 1280px | ✓ | ✓ | ✓ |
| Analytics: nav back → same test open | ✓ | ✓ | ✓ |
| Blueprint: nav back → same blueprint editing | ✓ | ✓ | ✓ |
| Authoring: "Authoring" tab absent from nav | ✓ | — | — |
| Library filters (type, points) work | ✓ | ✓ | ✓ |
| Partial credit toggle visible in Multiple Response | ✓ | ✓ | ✓ |
| Back-to-blueprint from authoring works | ✓ | — | — |
| Practice + Enrollments buttons readable | ✓ | ✓ | ✓ |
| Student grade view readable | ✓ | ✓ | ✓ |
| Poor Discrimination / Latest badge readable | ✓ | ✓ | ✓ |
| Publish / Unpublish mutually exclusive (not disabled) | ✓ | — | — |

---

## File Inventory

### New files
- `src/hooks/useCountdown.ts`
- `src/components/sessions/CancelSessionModal.tsx`

### Modified files
- `src/components/layout/GlobalHeader.tsx` — remove Authoring tab
- `src/stores/useAnalyticsStore.ts` — add `lastTestId` / `setLastTestId`
- `src/stores/useBlueprintStore.ts` — add `lastEditingId` / `setLastEditingId`
- `src/stores/useAuthoringStore.ts` — add `partialPoints` / `setPartialPoints`
- `src/app/analytics/page.tsx` — redirect to last test if stored
- `src/app/analytics/tests/[testId]/page.tsx` — call `setLastTestId`, "← All tests" button, theme-audit buttons
- `src/app/blueprint/page.tsx` — state persistence, breakdown overflow fix, label cleanup, back-nav fix
- `src/app/author/page.tsx` — smart back button (`from` param)
- `src/app/sessions/page.tsx` — 3-section layout, cancel modal wiring, schedule toast
- `src/app/items/page.tsx` — type + points filters
- `src/app/my-results/[sessionId]/page.tsx` — dark theme token migration
- `src/components/ui/TimePicker.tsx` — full SpinnerColumn rewrite (no scrollTop)
- `src/components/sessions/ScheduledSessionsTable.tsx` — 3 sections, timers, Button primitives
- `src/components/sessions/SessionCreateForm.tsx` — title-only course dropdown, creation toast
- `src/components/sessions/CourseEnrollmentDrawer.tsx` — bulk enrollment tab
- `src/components/blueprint/QuestionPickerModal.tsx` — theme-aware (no inline styles)
- `src/components/analytics/AllItemsTable.tsx` — remove Version column
- `src/components/analytics/FlagBadge.tsx` — Badge primitive with correct tones
- `src/components/editor/MCQOptionsPanel.tsx` — partial credit toggle
- `src/components/ui/index.ts` — re-export if new primitives added

### Unchanged
- All backend code (except possible audit of publish endpoint + bulk enroll endpoint — changes are schema additions, no migrations needed)
- Database schema, migrations

---

## Out of Scope

- Automatic bulk-enroll via CSV upload (manual paste only in 7.8; CSV import is Epoch 11 territory)
- Mobile-optimised TimePicker (deferred per 7.7)
- Blueprint drag-and-drop reordering (separate UX project)
- Multi-step undo in authoring (deferred)

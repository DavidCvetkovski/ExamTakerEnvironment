# Epoch 8.2 — Blueprint Polish, Auth UX & Layout Hardening

> **Status:** Planned  
> **Branch:** `feature/epoch-8-2-blueprint-polish`  
> **Scope:** Frontend-first (9 of 10 stages). One backend touch: layout scroll and duplicate-blueprint bug. No DB migrations.

---

## Context

Epoch 8.1 shipped blueprint lifecycle (lock, delete, duplicate, back-nav guard) and a new home screen. During live testing, 9 concrete issues were identified that collectively degrade the constructor experience. This epoch resolves all of them in a staged, incremental way so each commit is self-contained and revertable.

---

## Issues Addressed

| # | Area | Issue |
|---|------|-------|
| 1 | Backend | Duplicate blueprint crashes — JSONB fields passed without `Json()` wrapper |
| 2 | Backend | Smart Draw with no matching questions crashes instead of returning a 400 with a clear error |
| 3 | Frontend / Store | `BlueprintSaveIndicator` runtime error — Pydantic v2 `{type,loc,msg,input}` objects rendered as React children |
| 4 | Blueprint Editor | "Publish Blueprint" button should say "Save Blueprint" |
| 5 | Blueprint Editor | "Practice Blueprint" available even when blueprint has unsaved changes — should be disabled + dirty indicator shown |
| 6 | Blueprint Editor | `BlueprintSaveIndicator` shows "Ready" text when idle — useless noise |
| 7 | Home Page | Logged-in users see the marketing landing page instead of a role-appropriate dashboard |
| 8 | Login Page | `/login` page is visually plain and inconsistent with the rest of the shell |
| 9 | Layout | Header tabs scroll with the page content (sticky broken); white space appears at bottom when scrolling |

---

## Engineering Principles (per CLAUDE.md)

- **Security:** No new endpoints without role guards. Auth-aware home page reads from JWT-backed `useAuthStore` — no client-side trust assumptions.
- **Maintainability:** Each stage touches one concern. No cross-concern edits per commit. `getApiErrorMessage` fix is the single source of truth for all blueprint-store error parsing.
- **Modularity:** The dirty-state indicator in the blueprint footer reuses `StatusDot` (existing primitive). The auth-aware home page composes existing page components rather than duplicating layout.
- **Scalability:** The scroll fix uses CSS layout properties (no JS scroll listeners) so it works at any viewport size and doesn't regress when new pages are added.
- **Ease of change:** Every "label" (button text, toast message) is a single string literal in one place. The dirty-state guard is a single `!!isDirty` expression.

---

## Stage 1 — Backend: Duplicate Blueprint Fix

**Files:** `backend/app/api/endpoints/tests.py`

**Problem:** The `duplicate_test_definition` endpoint creates a new record by passing `original.blocks` and `original.scoring_config` directly. These are JSONB fields that Prisma-Python requires to be wrapped in `Json()`. Without the wrapper, Prisma raises a type error and the duplicate call crashes with a 500.

**Fix:**
- Import `Json` from `prisma` at the top of `tests.py`.
- Wrap both JSONB fields: `"blocks": Json(original.blocks)`, `"scoring_config": Json(original.scoring_config)`.

**Verification:** Duplicate a blueprint via the UI — the copy appears in the list with all blocks/rules intact.

---

## Stage 2 — Backend: Smart Draw Empty Result Graceful Error

**Files:** `backend/app/services/exam_sessions_service.py`

**Status:** Already guarded with an `HTTPException(400)` when `len(candidates) < count`. The crash the user experienced was in the **frontend** — `instantiateSession` in `useExamStore` was not catching the error correctly and the error object (Pydantic/FastAPI 400 detail) was not being surfaced as a readable string in the toast.

**Fix:**
- Audit `useExamStore.instantiateSession` — ensure the `catch` block extracts `error.response.data.detail` (string) and throws an `Error` with that message.
- The blueprint-page `handleStartPreview` already wraps in try/catch and shows a toast. After this fix it will display the human-readable reason (e.g., "Random rule failed: Found 0 available items, but need 3.").

**Verification:** Create a RANDOM rule with an impossible filter (e.g., topic "ZZZnonexistent"). Click Practice Blueprint — a toast appears with the backend's explanation. No crash, no blank error.

---

## Stage 3 — Frontend: `getApiErrorMessage` Pydantic v2 Array Fix

**Files:** `frontend/src/stores/useBlueprintStore.ts`, `frontend/src/components/blueprint/BlueprintSaveIndicator.tsx`

**Problem:** FastAPI validation errors return `detail` as `list[{type, loc, msg, input}]` (Pydantic v2 format). The existing helper did `?.detail || fallback` — since a non-empty array is truthy, it stored the raw array in `state.error`. `BlueprintSaveIndicator` then rendered that array directly as a React child, causing the "Objects are not valid as a React child" runtime error.

**Fix — `useBlueprintStore.ts`:**
```ts
function getApiErrorMessage(error: unknown, fallback: string): string {
    const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((e: { msg?: string }) => e.msg ?? String(e)).join('; ');
    return fallback;
}
```

**Fix — `BlueprintSaveIndicator.tsx`:** Add a `typeof error === 'string'` guard before rendering `error` to ensure non-string values always fall back to 'Save failed'.

**Verification:** Trigger a validation error (e.g., save a blueprint with no title). The indicator shows a readable error message instead of crashing.

---

## Stage 4 — Frontend: Blueprint Editor Label & Dirty State

**Files:** `frontend/src/app/blueprint/page.tsx`, `frontend/src/components/blueprint/BlueprintSaveIndicator.tsx`

**Changes:**

1. **"Publish Blueprint" → "Save Blueprint"** — Rename the button label and update the three associated toast messages (`title: 'Cannot publish'` → `'Cannot save'`, `title: 'Blueprint published'` → `'Blueprint saved'`, `title: 'Publish failed'` → `'Save failed'`).

2. **Remove "Ready" text** — `BlueprintSaveIndicator` returned a `<div>Ready</div>` when `saveStatus === 'idle'`. Replace with `return null`.

3. **Dirty indicator in footer** — When `isDirty` is truthy, show a `StatusDot` (warning tone) + "Unsaved changes" label in the left side of the sticky footer, next to `BlueprintSaveIndicator`.

4. **Guard Practice Blueprint** — Disable the Practice Blueprint button when `!!isDirty` is true. Add a `title` tooltip: `"Save your changes before practicing"`. The button is already hidden when `!idFromUrl`; it now also becomes non-interactive when the blueprint has unsaved changes.

**Verification:**
- After loading a saved blueprint, footer shows no dirty indicator and Practice Blueprint is enabled.
- After editing any field, footer shows the warning dot + "Unsaved changes" and Practice Blueprint goes grey.
- After saving, dirty indicator disappears and Practice Blueprint re-enables.

---

## Stage 5 — Frontend: Auth-Aware Home Page

**Files:** `frontend/src/app/page.tsx`

**Problem:** Authenticated users land on the marketing landing page instead of a useful entry point.

**Design:**
- On mount, read `useAuthStore` → `{ isAuthenticated, user }`.
- If `isAuthenticated === true`: render a role-aware dashboard entry page showing:
  - A greeting with the user's name and role.
  - Quick-action cards linking to the user's primary surfaces:
    - Constructor/Admin: "Item Library", "Blueprints", "Sessions", "Analytics".
    - Student: "My Exams", "My Grades".
  - Recent activity summary (upcoming sessions for students; draft blueprints for constructors) — pulled from existing stores.
- If not authenticated: show the existing marketing landing page (unchanged).
- Use `useEffect` + `useRouter` to avoid a flash — if the auth state is still loading, show a neutral loading state.

**Reuses:** existing `Card`, `Button`, `Badge` primitives; `useAuthStore`; `useSessionStore`; `useBlueprintStore`.

**Verification:** Log in as a Constructor and navigate to `/`. See role-appropriate quick-action dashboard. Log out and see marketing page.

---

## Stage 6 — Frontend: Login Page Redesign

**Files:** `frontend/src/app/login/page.tsx`

**Design:**
- Split layout: left panel (60%) = brand illustration / ambient background (match home screen blob style, brand colors); right panel (40%) = login form card.
- Form card: OpenVision logo at top, "Welcome back" heading, email + password fields using `Input` primitive, Submit `Button`, error banner using `Badge` (danger tone).
- Remove any hardcoded credential hints if still present.
- Responsive: below `md` breakpoint, collapse to single-column centered card (same form, no illustration panel).
- Consistent with the Epoch 8.1 home screen aesthetic (animated background, `font-black` headings, brand blob).

**Verification:** Visit `/login` on dark, warm, and light-blue themes. Form is usable and visually consistent. Successful login redirects to home (auth-aware, so user sees dashboard).

---

## Stage 7 — Frontend: Layout Scroll Hardening

**Files:** `frontend/src/components/layout/GlobalHeader.tsx`, `frontend/src/app/layout.tsx` (root layout)

**Problem 1 — Header scrolls:** The global header has `sticky top-0 z-40` but the scroll container must be the `<html>` or `<body>` element (not an inner `<div>`). If the root layout wraps content in a `<div className="overflow-y-auto">`, sticky positioning attaches to that div's scroll container instead of the viewport, making the header scroll away.

**Fix:** Audit the root layout. The body/root `<div>` must be `h-screen overflow-hidden` (or `min-h-screen` with no `overflow` override). The scrollable region must be the main content area, not the root wrapper. Specifically:
- Root layout: `<body>` has `h-screen flex flex-col overflow-hidden`.
- `<GlobalHeader />` is rendered outside the scrollable region — it sits in the fixed/sticky flex column.
- The `<main>` below the header gets `flex-1 overflow-y-auto`.

**Problem 2 — White space at bottom:** This typically appears when a page component has `min-h-screen` or explicit bottom padding that extends past the viewport. Audit pages for `min-h-screen` when they are already inside a `flex-1 overflow-y-auto` container and remove or convert to `min-h-full`.

**Verification:** Scroll any long page (analytics, blueprint editor). Header stays fixed. No white space appears below content. Test on dark and warm themes.

---

## Stage 8 — Frontend: `useExamStore` Error Surface

**Files:** `frontend/src/stores/useExamStore.ts`

**Fix:** Mirror the `getApiErrorMessage` pattern from `useBlueprintStore`. The `instantiateSession` function must extract `response.data.detail` (handling both string and Pydantic v2 array format) and throw an `Error` with the stringified message so callers receive a proper `Error` object in `catch`.

**Verification:** Smart Draw failure (stage 2 scenario) now surfaces a readable toast message in the blueprint page rather than a generic "Try again."

---

## Stage 9 — Frontend: Import UX Error Page Fix

**Files:** `frontend/src/stores/useImportStore.ts`

**Status:** `useImportStore` already has a correct `apiErrorMessage` helper that handles both string and array `detail`. No change needed here. This stage is a verification-only pass.

**Verification:**
- Paste malformed import text → preview returns errors with line numbers → correct.
- Commit after preview → success toast shown, redirect to library.

---

## Stage 10 — Verification

**Checklist:**
- [ ] `npx tsc --noEmit` passes with zero errors.
- [ ] `npx next build` compiles successfully.
- [ ] `pytest backend/tests` — all tests pass.
- [ ] Duplicate blueprint: copy appears with all rules and scoring config.
- [ ] Smart draw with impossible filter: toast shows backend reason, no crash.
- [ ] Blueprint save indicator: no "Ready" text at rest; "Unsaved changes" dot appears on edit.
- [ ] "Practice Blueprint" is disabled when `isDirty === true`.
- [ ] Save Blueprint: correct toast "Blueprint saved", no more "published" language.
- [ ] Auth-aware home: Constructor sees dashboard; student sees exam links; unauthenticated sees marketing page.
- [ ] Login page: visually polished on all three themes.
- [ ] Header: sticky on every route, no bottom whitespace.
- [ ] Aikido scan: zero new Critical/High findings.

---

## Exit Criteria

All 10 stages complete, `tsc` + `next build` + `pytest` green, manual verification matrix passed, Aikido scan clean, merged to `main`.

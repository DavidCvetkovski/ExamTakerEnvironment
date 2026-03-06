## Epoch 4.5 Frontend Cohesion Audit

This document captures the current state of the Next.js/TypeScript frontend and highlights key cohesion and ergonomics issues to address during Epoch 4.5.

---

### 1. Structure Overview

- **Pages (`app/`)**
  - `app/page.tsx` – landing / redirect.
  - `app/login/page.tsx` – auth form.
  - `app/items/page.tsx` – question library dashboard.
  - `app/author/page.tsx` – authoring workbench (TipTap, MCQ panel).
  - `app/blueprint/page.tsx` – blueprint designer.
  - `app/exam/[id]/page.tsx` – student exam UI.
  - `app/layout.tsx`, `app/globals.css`, `app/favicon.ico` – layout & global styles.

- **State Stores (`stores/`)**
  - `stores/useAuthStore.ts`
  - `stores/useAuthoringStore.ts`
  - `stores/useBlueprintStore.ts`
  - `stores/useExamStore.ts`
  - `stores/useLibraryStore.ts`

- **Components (`components/`)**
  - Editor:
    - `components/editor/TipTapEditor.tsx`
    - `components/editor/TipTapEditor.css`
    - `components/editor/MCQOptionsPanel.tsx`
    - `components/editor/MCQOptionsPanel.css`
  - Auth:
    - `components/auth/ProtectedRoute.tsx`

- **API Client**
  - `lib/api.ts` – axios instance + interceptors.

The overall layout is clean. The main cross-feature behavior is implemented via the blueprint and exam pages plus their respective stores.

---

### 2. API Usage & Contracts

**Files inspected:**
- `frontend/src/lib/api.ts`
- `frontend/src/stores/useAuthStore.ts`
- `frontend/src/stores/useLibraryStore.ts`
- `frontend/src/stores/useAuthoringStore.ts`
- `frontend/src/stores/useBlueprintStore.ts`
- `frontend/src/stores/useExamStore.ts`

**Findings:**

- **Centralization:**
  - All HTTP traffic goes through `lib/api.ts` (axios instance) as intended.
  - Stores consistently use `api.get` / `api.post` / `api.put` and read from `response.data`.

- **Error handling:**
  - Stores use a common pattern:
    - `set({ isLoading: true, error: null })` at start.
    - In `catch`, read `err.response?.data?.detail` or fall back to a generic message.
  - Errors are stored in each store’s local `error` field; pages display them (e.g. exam page via `useExamStore().error`).
  - There is no shared error type or helper, but the pattern is simple and consistent enough for now.

- **Type contracts:**
  - `useBlueprintStore` defines TypeScript interfaces (`TestDefinition`, `TestBlock`, `SelectionRule`, `ValidationResponse`) that mirror backend schemas and test responses.
  - `useExamStore` defines `ExamSession` and `ExamItem` strongly typed, aligned with backend `ExamSessionResponse`.
  - `useLibraryStore` and `useAuthoringStore` also define types matching backend DTOs.
  - Overall, **contracts are explicit and well-modeled on the frontend**, even if there is no shared source with backend Pydantic models.

**Cohesion targets:**
1. Consider a **small shared error helper** to DRY up reading `err.response?.data?.detail`.
2. Optionally introduce a **`Result<T, ApiError>` pattern** (or lightweight equivalent) in store actions for better composition and tests.

---

### 3. State Management & Page Responsibilities

**Exam flow:**
- `useExamStore`:
  - State: `currentSession`, `isLoading`, `error`.
  - Actions:
    - `fetchSession(sessionId)` – GET `/sessions/{id}`.
    - `instantiateSession(testId)` – POST `/sessions/` creating a new session and setting `currentSession`.
  - Implements clean separation: the page reads this state; it does not perform raw HTTP.

- `app/exam/[id]/page.tsx`:
  - Uses `useExamStore` for data + loading + error.
  - Implements **timer logic** locally with `setInterval` using `currentSession.expires_at`.
  - Responsible for rendering:
    - Header (timer, submit button placeholder).
    - Questions mapped from `currentSession.items`.
  - No direct API calls or global state modifications.

**Blueprint flow:**
- `useBlueprintStore`:
  - Maintains:
    - `blueprints`: list of `TestDefinition`s.
    - `currentBlueprint`: `Partial<TestDefinition>`.
    - `validation`: `ValidationResponse | null`.
    - `isLoading` and `error`.
  - Actions:
    - `fetchBlueprints`, `fetchBlueprint`, `saveBlueprint`, `validateBlueprint`, `resetCurrent`.
  - All HTTP lives in the store; pages remain fairly thin.

- `app/blueprint/page.tsx` (not fully re-read here, but usage is implied):
  - Orchestrates blueprint creation/editing via `useBlueprintStore`.
  - Handles UI of blocks + rules, and likely uses `validation` for showing validation results.

**Authoring & Library flows:**
- `useAuthoringStore` and `useLibraryStore`:
  - Follow similar patterns: HTTP in stores, UI logic in pages/components.
  - Authoring page relies heavily on TipTap and MCQ components, but the state flow is consistent.

**Cohesion targets:**
1. **Custom hooks for orchestrated flows** (optional but helpful):
   - E.g., `useExamSession(sessionId)` that wraps `useExamStore` usage + timer logic and can be unit-tested separately.
   - E.g., `useBlueprintEditor()` that composes store calls and local view state.
2. Ensure pages remain mostly layout + composition, with orchestration moved into such hooks where it improves readability.

---

### 4. Cross-Feature Flow & E2E Coverage

**E2E file inspected:**
- `frontend/tests/e2e/exam-flow.spec.ts`

**Findings:**

- **Scenario covered:**
  - Admin logs in, creates a blueprint with duration and random rule.
  - Student with time accommodation logs in, goes to blueprint page, starts exam.
  - E2E verifies:
    - Redirect into `/exam/[id]`.
    - 2 rendered questions (matching RANDOM rule count).
    - Timer reflects 1.25x multiplier (e.g., `12m` for 10m base).

- **Strengths:**
  - This is a full, cross-feature flow that hits:
    - Auth (Epoch 3).
    - Blueprint engine (Epoch 4).
    - Exam session instantiation (Epoch 4).
    - Exam UI (Epoch 5) and accommodations.

- **Gaps / Opportunities:**
  - Single E2E scenario; no variations:
    - Different rule shapes (FIXED-only, multiple blocks).
    - Edge cases (under-provisioned rules, validation failure surfaces a clear message).
  - No E2E coverage for:
    - Item authoring UI itself (TipTap, MCQ panel).
    - Library filtering / “Create New” item from `/items`.

**Cohesion targets:**
1. Add at least **one more E2E scenario** focused on:
   - Validation failure for a blueprint and corresponding UI feedback.
2. Optionally, a **constructor-focused E2E**:
   - Author item → approve → blueprint using that item → validate → instantiate as student.

---

### 5. UX & Debuggability

**Findings:**

- Exam page shows:
  - Clear timer with `Time Remaining`.
  - Instruction panel explaining Freeze and (future) autosave.
  - Question cards styled consistently.
- Error and loading states:
  - Exam page displays `Loading exam session...` and `error` from `useExamStore`.
  - Similar patterns are used in other pages, but the wording and styling may not be uniform.

**Cohesion targets:**
1. Ensure **consistent loading / error messages and styling** across:
   - `/login`, `/items`, `/author`, `/blueprint`, `/exam/[id]`.
2. For **debuggability in dev**:
   - Consider optional debug-only labels (e.g., show session id, blueprint id, or role) to aid manual testing.

---

### 6. Summary of Highest-Impact Frontend Changes for Epoch 4.5

1. **Keep stores as the central coordination point** for server communication:
   - Avoid introducing direct HTTP in pages/components going forward.
   - Optionally introduce small helpers for shared error handling.
2. **Extract cross-page orchestration into custom hooks**:
   - `useExamSession(sessionId)` and `useBlueprintEditor()` as first candidates.
3. **Tighten contract documentation**:
   - Ensure interfaces in stores are explicitly aligned with backend contracts (and cross-referenced in a contracts doc).
4. **Expand E2E coverage**:
   - At least one validation-failure scenario.
   - Optionally one authoring → blueprint → exam story.
5. **Normalize UX for loading/error states**:
   - Reuse components or class patterns for status messaging across main pages.


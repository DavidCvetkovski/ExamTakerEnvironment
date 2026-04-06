# Epoch 6.5: Session Management Refinements Blueprint

## Overview
This Epoch acts as a rapid refinement focused on **UX improvements, strict Role-Based Access Control (RBAC), and Data Consistency** within the Session Manager module. Instructors orchestrating Exam Sessions currently face friction with the scheduling inputs, UI flow, and visual clutter, alongside an elevated privilege vulnerability where Constructors can create structural Course entities.

This Blueprint maps out the required frontend modifications to ensure scalability, security, and an industry-standard user experience.

---

## 1. Core Engineering Requirements Addressed

According to the OpenVision Master Plan (`GEMINI.md`):
- **Security First:** "Apply the principle of least privilege: each role should only have access to the endpoints and data it needs." We will formally strip `Course Creation` capabilities from the `CONSTRUCTOR` role.
- **Maintainability & Clean Code:** The timezone management will dynamically utilize the user's localized browser metadata rather than trusting or interpolating rigid UTC assumptions upfront.
- **Premium Aesthetics:** "Micro-animations... smooth gradients... avoiding generic aesthetics." The time picker UX will be significantly smoothed out.

---

## 2. Component Enhancements

### 2.1 Start Time Initialization & UX (The "Easy Picker")
Right now, deciding when an exam opens via the `<input type="datetime-local">` is manual and "clunky" (defaulting to blanks, forcing manual scrolling for year, month, day).
1. **Behavioral Change**: Ensure the `useState` value immediately initializes to exactly the **current local time** (e.g. rounded to the nearest next 15-minute interval).
2. **Implementation Flow**: We'll extract `helpers.ts` logic into a `useDateTimeLoader` or direct `useEffect` block on component mount that formats `new Date()` into the correct `YYYY-MM-DDThh:mm` string automatically, guaranteeing 0-click initialization for "start testing immediately" situations. The default must be resolved on the client after mount so server-side rendering never leaks server timezone assumptions into the browser-local picker state.

### 2.2 Localized Timezone Disclaimer
Since time is critical and servers run in UTC, users must have supreme confidence they are picking their exact time.
1. **Behavioral Change**: A dynamic label appended tightly under the schedule picker:
   > `"All exam times are scheduled based on your timezone (Current: Europe/Amsterdam)"`
2. **Implementation Flow**: Rely solely on `Intl.DateTimeFormat().resolvedOptions().timeZone` to print their zone so it is impossible to confuse Server Time vs Local Time.

### 2.3 Role-Based Interface Stripping
Currently, `SessionCreateForm.tsx` mounts a **Course Setup** sub-form alongside the Session Scheduling sub-form.
1. **Behavioral Change**: Only `ADMIN` identities can create a root `Course` (like "MATH101"). `CONSTRUCTOR` identities are essentially hired educators — they simply build Exams and schedule Sessions *for* existing Courses.
2. **Frontend Security Flow**:
   - `page.tsx` grabs `const { user } = useAuthStore()`.
   - We pass `isAdmin={user?.role === 'ADMIN'}` down to `SessionCreateForm.tsx`.
   - The `<form onSubmit={handleCreateCourse}>` logic is conditionally entirely masked using React strict checks `{isAdmin && (<form>...)}`.
   - When masked, the overarching CSS grid adjusts so the `Session Manager` form spans optimally using responsive tailwind directives (e.g. `xl:grid-cols-1 max-w-3xl`).

---

## 3. End-to-End Implementation Stages

### Stage 1: Security & Interface Hiding
**Objective:** Pass the `isAdmin` boolean property to the `SessionCreateForm` interface and cleanly mask the right-hand panel. Fix grid layout expansion when hidden.

*Exit Criteria:* 
- A `CONSTRUCTOR` sees exclusively the "Schedule Session" interface spanning beautifully central to the screen.
- An `ADMIN` sees the split-panel configuration (Schedule Session | Course Setup).

### Stage 2: Temporal Refinement
**Objective:** Programmatically prepopulate the scheduling UI with the `datetime-local` standard format and inject localized timezone context visually.

*Exit Criteria:*
- On page load, `startsAt` matches the actual real-world clock time (to the minute).
- The `Intl` geographic timezone displays gracefully.

### Stage 3: Verification & Edge Coverage
**Objective:** Adjust test harnesses to account for E2E validation against the new initialized time formatting and hidden views.

*Exit Criteria:*
- Run the Playwright suites. Ensure no testing bottlenecks emerge due to form restructuring.

---

## 4. API & Backend Security Context

While this Epoch primarily concerns the frontend UX, **ensure the backend explicitly enforces this logic** in the background:
- Any attempts to `POST /api/courses` by a user role `!= ADMIN` should strictly yield `HTTP 403 Forbidden`. The route dependency should allow `ADMIN` only.

---

## 5. Exit Gate

Before marking this Blueprint as complete, confirm the following RBAC rule holds natively in Chrome:
- User `constructor_e2e@vu.nl` cannot find or access the `Create Course` button, and the remaining scheduler fields auto-populate fluidly.

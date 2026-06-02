# Proctoring & Safe Exam Browser — Operations Runbook (Epoch 11)

This covers enabling SEB for an exam, supervising a live window, triaging
incidents, and the failure modes you will actually hit on exam day.

## 1. Concepts

- **Proctoring policy** lives on the blueprint (`test_definitions.proctoring_config`)
  and is edited in the blueprint editor's **Security & Proctoring** panel.
- **SEB integrity** is enforced by the backend on every exam-data request. The
  browser-side gate is only a convenience; the real control is the `403` the API
  returns to any non-SEB request.
- **Presence** (green/yellow/red) is derived from the student's last accepted
  heartbeat: `< 30s` Active, `< 90s` Idle, otherwise Disconnected.
- **Incidents** are append-only security events. `SERVER`-sourced incidents are
  proven (failed SEB hash, blocked IP, fingerprint mismatch); `CLIENT`-sourced
  ones are behavioral signals (tab switch, copy attempt) and are evidence, not
  proof.

## 2. Enabling SEB for an exam

1. Open the blueprint, expand **Security & Proctoring**, toggle **Require Safe
   Exam Browser** (plus any of: block copy/paste, suppress right-click, require
   fullscreen, detect tab switching, detect device sharing). Optionally add an
   **IP allow-list** (CIDR per line) for on-campus-only exams. Save.
2. Schedule the exam window as usual (`/sessions`).
3. From the **Ongoing** row, use the **⋯ → Download SEB config** action to get
   the `.seb` file. Distribute it to lab machines or via the LMS. Students can
   also self-download it from their exam list.
4. Students open the `.seb` with SEB installed; SEB launches, they sign in, join,
   and every subsequent request carries the SEB integrity header.

> **Config Key vs Browser Exam Key.** By default OpenVision runs **BEK-only**
> (`SEB_CONFIG_KEY_ENABLED=false`): paste the Browser Exam Key SEB shows into the
> policy's `allowed_browser_exam_keys`. To use the auto-derived **Config Key**
> instead, set `SEB_CONFIG_KEY_ENABLED=true` **only after** validating parity
> against a real SEB build (see implementation directive §6.3).

## 3. The #1 failure mode: URL mismatch

SEB hashes the **exact public URL** it requested. If the value the server
reconstructs differs by even a trailing slash, **every** SEB request `403`s.

If a whole hall is being rejected:
- Confirm `PUBLIC_EXAM_URL_BASE` matches the scheme+host (+port) in the `.seb`
  `startURL`.
- Confirm Nginx preserves the request path and forwards `X-Forwarded-Proto` and
  `Host` unchanged.
- Re-download and redistribute the `.seb` if the exam URL changed (the Config Key
  changes with it).

## 4. Supervising a live exam

From the **Ongoing** session row, click **Monitor** to open
`/sessions/{id}/monitor`:
- The table auto-refreshes every 5s (polling pauses while the tab is hidden).
- **Green/Yellow/Red** is presence. Yellow during a large exam is usually flaky
  Wi-Fi, not cheating — watch for *patterns*, not single blips.
- **Flagged for review** marks attempts with a CRITICAL incident.
- Row actions: **Extend +5/+15 min**, **Pause/Resume**, **Terminate**.
  - *Extend* pushes the student's deadline (capped at the window close).
  - *Pause* freezes the attempt; the student's heartbeats are rejected and their
    clock is credited back on *Resume*.
  - *Terminate* force-submits the attempt for grading and cannot be undone.
- Every supervisor action is recorded as a `SUPERVISOR_*` incident.

## 5. Incident triage

The incident feed (right of the monitor) is reverse-chronological and filterable
by severity. After the exam, review CRITICAL/WARNING incidents per student.
Remember: CLIENT incidents (tab switch, copy attempt) are signals to investigate,
not automatic misconduct. SERVER incidents (SEB hash invalid, IP blocked,
fingerprint mismatch) are proven policy violations.

## 6. Emergency fallback

If SEB validation is wrongly blocking a legitimate hall and you cannot fix the
URL/key quickly:
- **Per-test:** turn off **Require Safe Exam Browser** on the blueprint. The
  guard becomes a transparent pass-through immediately.
- **Global:** set `PROCTORING_ENABLED=false` (env) and restart the API. Use only
  as a last resort and record it in the incident notes — it disables enforcement
  for *all* exams.

Do **not** edit the database to work around a key mismatch.

# Epoch 14 — Progress Matrix

Updated incrementally as stages land.

| Stage | Description | Status |
|---|---|---|
| 14.x | Display-name: prisma + schema + preferences endpoint/service | ✅ |
| 14.x | Display-name: auth store + settings UI (`DisplayNameSection`) | ✅ |
| 14.1 | Blueprint list: `RowActionMenu` overflow | ✅ |
| 14.1 | Blueprint list: course grouping (`lib/courseGrouping.ts`) | ✅ |
| 14.2 | Inspect → editor origin-aware back (`from=editor`) | ✅ |
| 14.3 | Exam: ←/→ only nav, kill ↑/↓ | ✅ |
| 14.3 | Exam: stop radio/checkbox arrow-key selection bleed | ✅ |
| 14.4 | QTI: "Export all questions" (endpoint + service + UI) | ✅ |
| 14.5 | Home: `lib/navigation.ts`, all tabs, single label, display name | ✅ |
| 14.6 | Sessions table: `RowActionMenu` overflow (all actions) | ✅ |
| 14.7 | Proctoring review entry point + lifecycle labels (`?mode=review`) | ✅ |
| 14.7 | Incident CSV log export (endpoint + service + Download log button) | ✅ |
| 14.8 | Minimal warm auth pages (marketing + login) | ✅ |
| 14.9 | Analytics: hide Combined when no submissions | ✅ |
| — | `epoch_14_security_review.md` | ✅ |

## Verification

- Frontend `tsc --noEmit`: clean (whole project).
- ESLint on all changed files: clean.
- §7.1 color-token audit on new/changed files: empty (pass).
- Backend: all touched modules import; new validator unit-tested; the three new
  routes register on the app.
- `prisma db push` applied the `users.display_name` column; clients regenerated.
- New backend tests added in `tests/test_preferences.py` (display-name happy /
  blank-clears / over-length / unauth). These run under the existing `ac` ASGI
  fixture, which exercises app startup — needs the dev infra (Postgres + Redis)
  up, same as the rest of the suite. Pure validator logic verified standalone.

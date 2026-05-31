# Epoch 10 Progress Matrix

> Last updated: 2026-05-31
> Purpose: track Epoch 10 (Accessibility & Inclusive Design) status against the
> blueprint stage plan (`epoch_10_accessibility_blueprint.md` §7).

## Progress Matrix

| Stage | Deliverable | Status | Key Files |
|---|---|---|---|
| 1 | Schema: a11y pref columns, `accommodation_enlarged_display`, audit table | Complete | `prisma/schema.prisma`, `backend/app/models/accommodation_audit.py` |
| 2 | Accessibility prefs API + `/auth/me` surfacing | Complete | `backend/app/schemas/preferences.py`, `backend/app/schemas/auth.py`, `backend/tests/test_accessibility_prefs.py` |
| 3 | `globals.css` a11y axis + `ThemeProvider` + account `AccessibilitySection` | Complete | `frontend/src/app/globals.css`, `frontend/src/components/layout/ThemeProvider.tsx`, `frontend/src/components/account/AccessibilitySection.tsx` |
| 4 | Keyboard/SR: announcer, skip links, ARIA, exam keyboard nav + shortcuts dialog | Complete | `frontend/src/components/ui/{LiveRegion,SkipLink,useAnnouncer}.tsx`, `frontend/src/components/exam/KeyboardShortcutsDialog.tsx`, `frontend/src/app/exam/[id]/page.tsx` |
| 4b | Effective exam scale (enlarged-display floor) | Complete | `frontend/src/lib/accessibility.ts`, `frontend/src/app/exam/[id]/page.tsx`, `backend/app/schemas/auth.py` |
| 5 | Accommodation admin module (BE) + `/admin/accommodations` (FE) + CSV import | Complete | `backend/app/api/endpoints/accommodations.py`, `backend/app/services/accommodations_service.py`, `frontend/src/app/admin/accommodations/page.tsx`, `frontend/src/stores/useAccommodationsStore.ts` |
| 6 | Verification: keyboard E2E + axe-core a11y checks | Complete (local) | `frontend/tests/e2e/exam-keyboard.spec.ts`, `frontend/tests/e2e/a11y-axe.spec.ts` |
| 7 | Security checklist §6 + manual review | In progress | `directives/epoch_10_security_review.md` |

## 2026-05-31 Pass — What Changed (closing-out slice)

1. **Added `resolveExamTextScale` helper** (`lib/accessibility.ts`) — the single
   source for `max(preference, enlarged ? 'lg' : 'md')` — and wired it on the
   exam screen, scoped so the `zoom` token doesn't compound with the html-level
   preference scale.
2. **Surfaced `accommodation_enlarged_display`** on `UserPublic` (backend +
   frontend store) so the exam screen can honour the admin grant.
3. **Keyboard shortcuts help dialog** (`KeyboardShortcutsDialog`) plus the `f`
   (flag, with live-region announcement) and `?` (help) exam shortcuts.
4. **Verification specs**: `exam-keyboard.spec.ts` (keyboard-only flow) and
   `a11y-axe.spec.ts` (`@axe-core/playwright`, zero serious/critical on the four
   key routes).
5. **Fixed a pre-existing typecheck break** in `useExamStore.createClientEventId`
   (the `in`-narrowing collapsed `crypto` to `never`).
6. **Wrote the V-gate / security review** (`directives/epoch_10_security_review.md`).

## Known Gaps / Risks

- Lighthouse ≥ 90 and the manual VoiceOver pass are local merge-gate steps (not
  automated) — see the review doc §A.
- The Playwright V-gate specs run locally; a CI E2E job is deferred (shared with
  the Epoch 13 "optional Playwright smoke" item).
- OpenDyslexic webfont binary is still vendored as a fallback stack (TODO-016 in
  `globals.css`) — spacing/line-height boosts apply regardless.

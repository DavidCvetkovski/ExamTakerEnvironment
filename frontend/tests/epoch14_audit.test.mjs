/**
 * Verification tests for the Epoch 14 bug audit (directives/epoch_14_bug_audit.md).
 *
 * The frontend has no unit-test runner (only Playwright E2E), so these use
 * Node's built-in `node:test` with zero extra dependencies. Two flavours:
 *
 *  - **Source assertions**: read the real component/hook source and assert a
 *    structural property (e.g. "attaches fullscreenchange but never calls
 *    requestFullscreen"). Proves DOM/side-effect findings without a browser.
 *  - **Logic ports**: replicate the exact pure expression from the source and
 *    feed it edge-case inputs. The replicated line is quoted from the file in a
 *    comment so the mirror is auditable.
 *
 * Run: `node --test tests/epoch14_audit.test.mjs` from frontend/.
 *
 * A failing assertion ⇒ the finding is REAL (current code has the defect).
 * Each test's name states the expected verdict.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(resolve(__dirname, '..', 'src', p), 'utf8');

// ===========================================================================
// C-2 · require_fullscreen never actually enters fullscreen
// File: frontend/src/hooks/useProctoring.ts:108-115
// ===========================================================================
test('C-2 [FIXED]: useProctoring now calls requestFullscreen when require_fullscreen is set', () => {
    const hook = src('hooks/useProctoring.ts');
    assert.match(hook, /fullscreenchange/, 'exit listener still present');
    assert.match(hook, /requestFullscreen/, 'now also requests fullscreen on mount');
    assert.match(hook, /document\.fullscreenElement/, 'guards against requesting if already in fullscreen');
});

// ===========================================================================
// H-8 · img tags in question HTML allow external tracking pixels
// File: frontend/src/components/exam/QuestionRenderer.tsx:16-23
// ===========================================================================
test('H-8 [FIXED]: shared exam sanitizer strips non-relative img src via a hook', () => {
    const util = src('lib/sanitizeHtml.ts');
    // img is still allowed (diagrams render) ...
    assert.match(util, /ALLOWED_TAGS[\s\S]*'img'/, 'img is allowed');
    // ... but an afterSanitizeAttributes hook removes any non-relative src.
    assert.match(util, /addHook\(\s*'afterSanitizeAttributes'/, 'image-source guard hook present');
    assert.match(util, /removeAttribute\('src'\)/, 'strips disallowed src');
    assert.match(util, /isRelative/, 'only same-origin/relative paths kept');
    // The exam render path uses the shared sanitizer (not a bare DOMPurify config).
    const renderer = src('components/exam/QuestionRenderer.tsx');
    assert.match(renderer, /from '@\/lib\/sanitizeHtml'/, 'QuestionRenderer uses the shared util');
});

// ===========================================================================
// H-6 · ReviewSummary flagged/answered/unanswered counts don't sum to total
// File: frontend/src/components/exam/ReviewSummary.tsx:21-23
// ===========================================================================
//
// Exact port of the current expressions (ReviewSummary.tsx:21-23):
//   answeredItems   = items.filter((i) => !!answers[i.learning_object_id]);
//   unansweredItems = items.filter((i) => !answers[i.learning_object_id]);
//   flaggedItems    = items.filter((i) => flags[i.learning_object_id]);
function currentCounts(items, answers, flags) {
    const answered = items.filter((i) => !!answers[i.id]).length;
    const unanswered = items.filter((i) => !answers[i.id]).length;
    const flagged = items.filter((i) => flags[i.id]).length;
    return { answered, unanswered, flagged };
}
// Proposed fix (audit): flagged is its own bucket; unanswered excludes flagged.
function fixedCounts(items, answers, flags) {
    const flaggedIds = new Set(items.filter((i) => flags[i.id]).map((i) => i.id));
    const answered = items.filter((i) => !!answers[i.id] && !flaggedIds.has(i.id)).length;
    const unanswered = items.filter((i) => !answers[i.id] && !flaggedIds.has(i.id)).length;
    const flagged = flaggedIds.size;
    return { answered, unanswered, flagged };
}

test('H-6 [REAL]: current counts over-count the total whenever a flag exists', () => {
    // 10 items: 7 answered (2 of them flagged), 3 unanswered (1 flagged).
    const items = Array.from({ length: 10 }, (_, n) => ({ id: `q${n}` }));
    const answers = {};
    for (let n = 0; n < 7; n++) answers[`q${n}`] = 'x'; // q0..q6 answered
    const flags = { q0: true, q1: true, q7: true }; // 2 answered-flagged, 1 unanswered-flagged

    const { answered, unanswered, flagged } = currentCounts(items, answers, flags);
    assert.equal(answered, 7);
    assert.equal(unanswered, 3);
    assert.equal(flagged, 3);
    // The three numbers shown side-by-side sum to 13, not 10 → student confusion.
    assert.equal(answered + unanswered + flagged, 13);
    assert.notEqual(answered + unanswered + flagged, items.length,
        'FINDING NOT REAL if these are equal');
});

test('H-6 fix: mutually-exclusive buckets sum to the total', () => {
    const items = Array.from({ length: 10 }, (_, n) => ({ id: `q${n}` }));
    const answers = {};
    for (let n = 0; n < 7; n++) answers[`q${n}`] = 'x';
    const flags = { q0: true, q1: true, q7: true };

    const { answered, unanswered, flagged } = fixedCounts(items, answers, flags);
    assert.equal(answered + unanswered + flagged, items.length, 'fixed buckets must partition');
    // Edge: all flagged
    const allFlags = Object.fromEntries(items.map((i) => [i.id, true]));
    const f2 = fixedCounts(items, answers, allFlags);
    assert.equal(f2.answered + f2.unanswered + f2.flagged, items.length);
    assert.equal(f2.flagged, 10);
    // Edge: no flags → identical to a clean answered/unanswered split
    const f3 = fixedCounts(items, answers, {});
    assert.deepEqual(f3, { answered: 7, unanswered: 3, flagged: 0 });
});

// ===========================================================================
// H-7 · "Confirm Submission" button can be double-clicked
// File: frontend/src/components/exam/ReviewSummary.tsx:112-117
// ===========================================================================
test('H-7 [FIXED]: confirm button is disabled while isSubmitting and shows a spinner label', () => {
    const review = src('components/exam/ReviewSummary.tsx');
    assert.match(review, /isSubmitting/, 'ReviewSummary now receives isSubmitting');
    assert.match(review, /disabled=\{isSubmitting\}/, 'button disabled when submitting');
    assert.match(review, /Submitting/, 'label changes while submitting');
});

test('H-7 [REAL]: page hides the review modal only AFTER the await resolves', () => {
    const page = src('app/exam/[id]/page.tsx');
    // setShowReview(false) sits after `await submitExam(...)`, so the modal (and
    // its live button) stays mounted during the in-flight request.
    const m = page.match(/await submitExam\(sessionId\);\s*\n\s*setShowReview\(false\);/);
    assert.ok(m, 'expected submit-then-hide ordering that keeps the button live mid-request');
});

// ===========================================================================
// H-3 · sendBeacon URL construction drops the API prefix on non-slash base
// File: frontend/src/hooks/useHeartbeat.ts:63-68
// ===========================================================================
//
// Exact port of the source construction:
//   new URL(`sessions/${sessionId}/heartbeat`, api.defaults.baseURL ?? origin)
const beaconUrl = (sessionId, baseURL) =>
    new URL(`sessions/${sessionId}/heartbeat`, baseURL).toString();
// Proposed fix: string interpolation, trimming any trailing slash.
const beaconUrlFixed = (sessionId, baseURL) =>
    `${baseURL.replace(/\/$/, '')}/sessions/${sessionId}/heartbeat`;

test('H-3 [REAL, conditional]: base without trailing slash drops the last path segment', () => {
    // Default base in api.ts ends with /api/ → works fine (the common case).
    assert.equal(
        beaconUrl('S1', 'http://127.0.0.1:8000/api/'),
        'http://127.0.0.1:8000/api/sessions/S1/heartbeat',
    );
    // A base WITHOUT a trailing slash (e.g. NEXT_PUBLIC_API_BASE_URL=https://x/api)
    // — `new URL` replaces the last segment → the /api prefix is silently lost.
    assert.equal(
        beaconUrl('S1', 'https://x.example.com/api'),
        'https://x.example.com/sessions/S1/heartbeat', // ← '/api' dropped → 404
    );
    // And a multi-segment prefix loses only the last segment:
    assert.equal(
        beaconUrl('S1', 'https://x.example.com/api/v1'),
        'https://x.example.com/api/sessions/S1/heartbeat', // ← '/v1' dropped
    );
});

test('H-3 fix: interpolation preserves the prefix regardless of trailing slash', () => {
    for (const base of ['https://x.example.com/api', 'https://x.example.com/api/', 'https://x.example.com/api/v1']) {
        const url = beaconUrlFixed('S1', base);
        assert.ok(url.includes('/api'), `prefix preserved for ${base}: ${url}`);
        assert.ok(url.endsWith('/sessions/S1/heartbeat'));
    }
});

// ===========================================================================
// H-1 · Empty timer display on first render
// File: frontend/src/app/exam/[id]/page.tsx:44, 84-120
// ===========================================================================
test('H-1 [REAL]: timeLeft starts empty and is only set inside the interval', () => {
    const page = src('app/exam/[id]/page.tsx');
    // Initialised to '' ...
    assert.match(page, /useState<string>\(''\)/, 'timeLeft initial value is empty string');
    // ... and the ONLY setTimeLeft calls live inside the setInterval body (first
    // one fires 1000 ms after mount). There is no synchronous initialisation from
    // currentSession before the interval registers.
    const beforeInterval = page.slice(0, page.indexOf('const interval = setInterval'));
    assert.equal(
        /setTimeLeft\(/.test(beforeInterval),
        false,
        'FINDING NOT REAL if setTimeLeft is called synchronously before the interval',
    );
});

// ===========================================================================
// H-2 · "Timer does not resync with server after tab-switch"
// File: frontend/src/app/exam/[id]/page.tsx:84-120
// The timer is computed from the ABSOLUTE expires_at vs the live wall clock on
// every tick — not by decrementing a local counter — so throttling can't make
// it drift; the next tick after return is correct. expires_at is immutable
// post-join (pause/extend removed). These tests DISPROVE H-2 as described.
// ===========================================================================
//
// Exact port of the per-tick computation (page.tsx:88-115):
function formatTimeLeft(expiresAtMs, nowMs) {
    const diff = expiresAtMs - nowMs;
    if (diff <= 0) return 'EXPIRED';
    const hours = Math.floor(diff / 1000 / 60 / 60);
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    const seconds = Math.floor((diff / 1000) % 60);
    return hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`;
}

test('H-2 [NOT REAL]: countdown is stateless wrt prior ticks → self-corrects after a throttle gap', () => {
    const expires = 1_000_000_000_000; // fixed server timestamp
    // Tick at T (10 min left).
    assert.equal(formatTimeLeft(expires, expires - 10 * 60_000), '10m 0s');
    // Tab hidden; intervals throttled for 7 minutes. On return the NEXT tick
    // computes against the real wall clock and shows the TRUE remaining time —
    // no accumulated drift, because nothing was being decremented locally.
    assert.equal(formatTimeLeft(expires, expires - 3 * 60_000), '3m 0s');
    // The output depends ONLY on (expires, now); identical inputs → identical
    // output regardless of how many ticks were missed → re-fetching expires_at
    // (which never changes after join) would return the exact same value.
    assert.equal(
        formatTimeLeft(expires, expires - 3 * 60_000),
        formatTimeLeft(expires, expires - 3 * 60_000),
    );
});

// ===========================================================================
// H-4 · Resuming an in-progress exam always resets the student to Q1
// File: frontend/src/stores/useExamStore.ts:168-169, 329-352
// ===========================================================================
test('H-4 [FIXED]: navigateTo persists the index and loadSavedAnswers restores it', () => {
    const store = src('stores/useExamStore.ts');
    // navigateTo writes the index to localStorage.
    assert.match(store, /openvision_q_index_/, 'index persisted under a session-keyed key');
    // loadSavedAnswers now reads it back.
    const lsa = store.slice(store.indexOf('loadSavedAnswers: async'), store.indexOf('syncStatus: async'));
    assert.match(lsa, /openvision_q_index_/, 'loadSavedAnswers restores the index');
    assert.match(lsa, /currentQuestionIndex/, 'sets currentQuestionIndex from the saved value');
});

// ===========================================================================
// M-10 · MCQ options render plain text in the exam but HTML in results
// Files: MCQQuestion.tsx:55, MultipleResponseQuestion.tsx:62,
//        my-results/[sessionId]/page.tsx:53
// ===========================================================================
test('M-10 [FIXED]: exam choice components now render sanitized HTML (html ?? text)', () => {
    const mcq = src('components/exam/MCQQuestion.tsx');
    const mr = src('components/exam/MultipleResponseQuestion.tsx');

    for (const [name, code] of [['MCQ', mcq], ['MultipleResponse', mr]]) {
        // No longer plain-text only; renders the html field through the shared sanitizer.
        assert.match(code, /sanitizeExamHtml\(choice\.html \?\? choice\.text\)/,
            `${name} renders sanitized choice.html ?? text`);
        assert.match(code, /dangerouslySetInnerHTML/, `${name} uses HTML render`);
        assert.equal(/>\{choice\.text\}</.test(code), false, `${name} no longer renders bare {choice.text}`);
    }
});

// ===========================================================================
// L-1 / M-11 · Sticky headers use z-10 (CLAUDE.md §7.4.1 requires z-30)
// ===========================================================================
test('L-1 [FIXED]: exam sticky header now uses z-30', () => {
    const page = src('app/exam/[id]/page.tsx');
    assert.match(page, /<header className="sticky top-0 z-30\b/, 'exam header is now z-30');
});

test('M-11 [FIXED]: grading sticky header now uses z-30', () => {
    const page = src('app/grading/[sessionId]/page.tsx');
    assert.match(page, /sticky top-0 z-30\b/, 'grading header is now z-30');
});

// ===========================================================================
// M-12 · "Graded" indicator checks feedback presence, not grade status
// File: frontend/src/app/grading/[sessionId]/page.tsx:217-219
// ===========================================================================
test('M-12 [FIXED]: Graded badge gates on updated_at to correctly identify manual grading completion', () => {
    const page = src('app/grading/[sessionId]/page.tsx');
    assert.match(page, /grade\.updated_at !== null/);
});

// ===========================================================================
// M-4 · Offline heartbeat queue not cleared on drain failure
// File: frontend/src/stores/useExamStore.ts:329-352
// ===========================================================================
test('M-4 [REAL]: removeItem runs only after a successful POST, not in finally/catch', () => {
    const store = src('stores/useExamStore.ts');
    const lsa = store.slice(store.indexOf('loadSavedAnswers: async'), store.indexOf('syncStatus: async'));
    // The drain awaits the POST and only THEN removes the key...
    assert.match(lsa, /await api\.post\([^\n]*heartbeat[\s\S]*?localStorage\.removeItem\(key\)/,
        'removeItem follows the awaited POST in the success path');
    // ...and the catch block does NOT clear the queue (it just comments/no-ops),
    // so a 403/4xx leaves the queue to retry indefinitely on each load.
    const catchBlock = lsa.slice(lsa.indexOf('} catch'));
    const firstCatch = catchBlock.slice(0, catchBlock.indexOf('}', catchBlock.indexOf('{')) + 1);
    assert.equal(/removeItem/.test(firstCatch), false,
        'FINDING NOT REAL if the catch clears the queue');
    // And there is no finally clause around the drain.
    assert.equal(/finally\s*\{/.test(lsa.slice(0, lsa.indexOf('api.get'))), false,
        'FINDING NOT REAL if a finally clears the queue');
});

// ===========================================================================
// Medium UX confirmations (the "real" verdict = the described gap exists today)
// ===========================================================================
test('M-1 [FIXED]: monitor header shows session identity context when metadata is available', () => {
    const page = src('app/sessions/[scheduledId]/monitor/page.tsx');
    const headerRegion = page.slice(page.indexOf('<PageHeader'), page.indexOf('actions='));
    assert.match(headerRegion, /sessionMeta\.course_code/);
    assert.match(headerRegion, /sessionMeta\.test_title/);
});

test('M-2 [FIXED]: cancel confirm copy is status-dependent and escalated for live sessions', () => {
    const page = src('app/sessions/page.tsx');
    const handler = page.slice(page.indexOf('handleRequestCancel'), page.indexOf('handleRequestCancel') + 500);
    assert.match(handler, /session\?\.status === 'ACTIVE'/);
    assert.match(handler, /actively taking/);
});

test('M-3 [FIXED]: "Review proctoring" is gated on has_proctoring', () => {
    const table = src('components/sessions/ScheduledSessionsTable.tsx');
    assert.match(table, /showReview\s*&&\s*session\.has_proctoring/);
});

test('L-9 [FIXED]: "Download SEB config" is available for scheduled and active sessions via showMonitor or showSebDownload', () => {
    const table = src('components/sessions/ScheduledSessionsTable.tsx');
    assert.match(table, /showMonitor\s*\|\|\s*showSebDownload/);
});

test('M-6 [FIXED]: my-grades shows a refreshing indicator during background re-fetch', () => {
    const page = src('app/my-grades/page.tsx');
    assert.match(page, /myResultsLoading && myResults\.length === 0/);
    assert.match(page, /Refreshing/i, 'refreshing indicator should exist when results are present and loading');
});

test('M-13 [FIXED]: grading page contains prev/next student navigation', () => {
    const page = src('app/grading/[sessionId]/page.tsx');
    assert.match(page, /prevSessionId/);
    assert.match(page, /nextSessionId/);
});

test('M-14 [FIXED]: bulk enroll surfaces pre-flight count of parsed emails', () => {
    const drawer = src('components/sessions/CourseEnrollmentDrawer.tsx');
    assert.match(drawer, /parsedEmails\.length/);
    assert.match(drawer, /Enroll \$\{parsedEmails\.length\}/);
});

test('M-15 [FIXED]: session create form shows the computed window-close time preview', () => {
    const form = src('components/sessions/SessionCreateForm.tsx');
    assert.match(form, /endsAtPreview/);
    assert.match(form, /Window closes at/);
});

// ===========================================================================
// L-5 · Low-time warning is string-prefix based
// File: frontend/src/app/exam/[id]/page.tsx:248-251
// Verdict: NOT an active bug (formatter always emits "0m 59s"), but a REAL latent
// fragility (breaks if the format ever drops the "0m" prefix).
// ===========================================================================
function fmt(expiresMs, nowMs) { // port of page.tsx:88-115
    const diff = expiresMs - nowMs;
    if (diff <= 0) return 'EXPIRED';
    const h = Math.floor(diff / 3_600_000), m = Math.floor((diff / 60_000) % 60), s = Math.floor((diff / 1000) % 60);
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}
const isLowTime = (t) => t.startsWith('0m') || t.startsWith('1m') || t.startsWith('2m'); // port

test('L-5 [NOT an active bug]: sub-minute DOES warn because format emits "0m 59s"', () => {
    const e = 1_000_000_000_000;
    assert.equal(fmt(e, e - 59_000), '0m 59s');       // sub-minute is "0m 59s"
    assert.equal(isLowTime('0m 59s'), true);          // → warns correctly
    // Correct across the boundary: warns < 3 min, not at/above.
    assert.equal(isLowTime(fmt(e, e - 2 * 60_000 - 59_000)), true);  // 2m59s warns
    assert.equal(isLowTime(fmt(e, e - 3 * 60_000)), false);          // 3m0s no warn
    // No false positives for 10-29 min or hours.
    assert.equal(isLowTime(fmt(e, e - 12 * 60_000)), false); // 12m0s
    assert.equal(isLowTime(fmt(e, e - 20 * 60_000)), false); // 20m0s
    assert.equal(isLowTime(fmt(e, e - 65 * 60_000)), false); // 1h5m0s
});

test('L-5 [REAL fragility]: a "59s" format (no 0m) would silently disable the warning', () => {
    // If the formatter is ever changed to drop the "0m" for sub-minute times...
    assert.equal(isLowTime('59s'), false); // ← warning silently lost
    // The duration-based fix the audit proposes is immune:
    const msLeftWarns = (ms) => ms < 3 * 60_000;
    assert.equal(msLeftWarns(59_000), true);
    assert.equal(msLeftWarns(3 * 60_000), false);
});

// ===========================================================================
// L-10 · Nav active highlight uses startsWith (finding admits "not currently broken")
// File: frontend/src/components/layout/GlobalHeader.tsx:71
// ===========================================================================
test('L-10 [FIXED]: nav link active state uses exact match or sub-path boundary to prevent collisions', () => {
    const header = src('components/layout/GlobalHeader.tsx');
    assert.match(header, /pathname === link\.href \|\| pathname\.startsWith\(link\.href \+ '\/'\)/);
});

// ===========================================================================
// L-14 · SubmissionConfirmation return label defaults to "Back to Sessions"
// File: frontend/src/components/exam/SubmissionConfirmation.tsx:21
// ===========================================================================
test('L-14 [REAL]: any non-/my-exams return path gets "Back to Sessions"', () => {
    const label = (returnPath) => (returnPath === '/my-exams' ? 'Back to My Exams' : 'Back to Sessions'); // port
    assert.equal(label('/my-exams'), 'Back to My Exams');
    assert.equal(label('/sessions'), 'Back to Sessions');
    // A future/other path silently mislabels:
    assert.equal(label('/my-results'), 'Back to Sessions'); // ← wrong-ish
    assert.equal(label('/blueprint'), 'Back to Sessions');  // ← wrong
});

// ===========================================================================
// L-15 · Answered-count uses truthiness (safe today, latent for falsy payloads)
// File: frontend/src/components/exam/ExamFooter.tsx:30
// ===========================================================================
test('L-15 [latent]: truthiness count miscounts a falsy answer payload', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const truthy = (answers) => items.filter((i) => answers[i.id]).length;    // current
    const keyed = (answers) => items.filter((i) => i.id in answers).length;   // fixed
    // Today's payloads are non-empty strings/objects → both agree.
    assert.equal(truthy({ a: 'opt1', b: { x: 1 } }), 2);
    assert.equal(keyed({ a: 'opt1', b: { x: 1 } }), 2);
    // A future numeric/boolean answer of 0/false/'' is undercounted by truthiness:
    assert.equal(truthy({ a: 0, b: false, c: '' }), 0);  // ← all 3 "unanswered"
    assert.equal(keyed({ a: 0, b: false, c: '' }), 3);   // correct: 3 answered
});

// ===========================================================================
// Remaining Low / Suggestion confirmations (real = the described gap exists)
// ===========================================================================
test('L-2 [FIXED]: account Back reads searchParams for ?from origin-awareness', () => {
    const page = src('app/account/page.tsx');
    assert.match(page, /searchParams\.get\('from'\)/);
    assert.match(page, /<BackButton href=\{backHref\}/);
});

test('L-3 [FIXED]: dashboard role defaults to null on undefined to avoid premature staff nav', () => {
    const page = src('app/page.tsx');
    assert.match(page, /const role = user\?\.role \?\? null/);
});

test('L-7 [FIXED]: monitor page auto-transitions to review mode when session closes', () => {
    const page = src('app/sessions/[scheduledId]/monitor/page.tsx');
    assert.match(page, /router\.replace\(`\/sessions\/\$\{scheduledId\}\/monitor\?mode=review`\)/);
});

test('L-8 [FIXED]: IncidentFeed severity filters explain their meaning via tooltips', () => {
    const feed = src('components/proctoring/IncidentFeed.tsx');
    assert.match(feed, /SEVERITY_LEGEND/);
    assert.match(feed, /Supervisor actions/);
});

test('L-11 [FIXED]: my-exams has a dedicated "Resume in progress" bucket for STARTED attempts', () => {
    const page = src('app/my-exams/page.tsx');
    assert.match(page, /inProgressSessions = sessions\.filter/);
    assert.match(page, /Resume your exam/);
});

test('L-12 [FIXED]: ProctoringGate SEB button uses the clearer "Get the exam launcher file" label', () => {
    const gate = src('components/exam/ProctoringGate.tsx');
    assert.match(gate, /Get the exam launcher file/);
    assert.match(gate, /Download the exam launcher file below|Open the downloaded file with Safe Exam Browser|The exam will launch automatically/);
});

test('L-16 [FIXED]: my-results uses no ⏳ emoji (banned by §7.2) — replaced by Spinner', () => {
    const page = src('app/my-results/[sessionId]/page.tsx');
    const count = (page.match(/⏳/g) || []).length;
    assert.equal(count, 0, 'no hourglass emoji should remain');
    assert.match(page, /<Spinner/);
});

test('L-17 [FIXED]: grading index page has a manual refresh button', () => {
    const page = src('app/grading/page.tsx');
    assert.match(page, /Refresh/);
    assert.match(page, /fetchRows\(\)/);
});

test('L-18 [FIXED]: SessionCreateForm uses serverNow for default and validation', () => {
    const form = src('components/sessions/SessionCreateForm.tsx');
    assert.match(form, /getClientSkewMs/);
    assert.match(form, /useServerNow/);
});

test('S-1 [FIXED]: monitor page has a session-level countdown to ends_at', () => {
    const page = src('app/sessions/[scheduledId]/monitor/page.tsx');
    assert.match(page, /closes in/i);
    assert.match(page, /useCountdown\(sessionMeta\?\.ends_at/);
});

test('S-2 [FIXED]: MonitorTable surfaces the accommodation multiplier when present', () => {
    const table = src('components/proctoring/MonitorTable.tsx');
    assert.match(table, /time_multiplier/);
});

test('S-4 [FIXED]: beforeunload handler sets returnValue to trigger native leave prompt', () => {
    const hook = src('hooks/useHeartbeat.ts');
    assert.match(hook, /beforeunload/);
    assert.match(hook, /returnValue/);
});

test('L-6 [FIXED]: completed section auto-expands if ongoing and scheduled are empty', () => {
    const table = src('components/sessions/ScheduledSessionsTable.tsx');
    assert.match(table, /showCompleted,\s*setShowCompleted\s*\]\s*=\s*useState\(/);
    assert.match(table, /!hasOngoing\s*&&\s*!hasScheduled/);
});

test('S-5 [FIXED]: joinScheduledSession flushes pendingEvents before resetting store state', () => {
    const store = src('stores/useExamStore.ts');
    const join = store.slice(store.indexOf('joinScheduledSession: async'), store.indexOf('joinScheduledSession: async') + 300);
    assert.match(join, /flushEvents/);
    const beforeReset = join.slice(0, join.indexOf('pendingEvents: []'));
    assert.match(beforeReset, /flushEvents/, 'expected events to be flushed before state reset');
});

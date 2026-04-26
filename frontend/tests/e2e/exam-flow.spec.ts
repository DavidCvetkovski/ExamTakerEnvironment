import { test, expect } from '@playwright/test';
import { loginAs, seedE2EData } from './helpers';

const mathBlueprint = 'Shuffle Lab: Numbers in Motion';
const mathCourseCode = 'MATH-140';
const firstMathPrompt = 'Math Warm Up: A bakery spends EUR 24 on setup and earns EUR 2 per roll. Break even quantity?';
const secondMathPrompt = 'Calculus Check: For f(x) = x^2, what is the slope of the tangent at x = 3?';

test.describe('Exam Lifecycle E2E', () => {

    test.beforeAll(async () => {
        seedE2EData();
    });

    test('staff practice attempts return to the session manager after submission', async ({ page }) => {
        await loginAs(page, 'constructor');
        await page.goto('/sessions', { timeout: 30000 });
        await expect(page.getByRole('heading', { name: 'Exam Windows by Course' })).toBeVisible();

        const practiceRow = page.locator('tr').filter({ hasText: mathCourseCode }).filter({ hasText: mathBlueprint }).first();
        await practiceRow.getByRole('button', { name: 'Practice' }).click();
        await expect(page).toHaveURL(/\/exam\/.+/);
        await expect(page.getByText(firstMathPrompt, { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(page.getByText(secondMathPrompt, { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Submit Exam' }).click();
        await page.getByRole('button', { name: 'Confirm Submission' }).click();

        const returnButton = page.getByRole('link', { name: 'Back to Session Manager' });
        await expect(returnButton).toBeVisible();
        await returnButton.click();
        await expect(page).toHaveURL(/\/sessions(?:\?.*)?$/);
    });

    test('exam timer expiry auto-submits the session instead of leaving it ungraded', async ({ page }) => {
        // Regression test for: timer expiry left sessions in STARTED/EXPIRED status so
        // they never appeared in the grading dashboard. The fix calls submitExam() when
        // the countdown hits zero instead of just disabling the UI.

        await loginAs(page, 'constructor');
        await page.goto('/sessions', { timeout: 30000 });
        await expect(page.getByRole('heading', { name: 'Exam Windows by Course' })).toBeVisible();

        // Start a practice session
        const practiceRow = page.locator('tr')
            .filter({ hasText: mathCourseCode })
            .filter({ hasText: mathBlueprint })
            .first();
        await practiceRow.getByRole('button', { name: 'Practice' }).click();
        await expect(page).toHaveURL(/\/exam\/.+/);

        const sessionId = page.url().split('/exam/')[1];
        await expect(page.getByText(firstMathPrompt, { exact: true })).toBeVisible();

        // Patch only the GET /sessions/{id} response to return expires_at ~1.5 s from now.
        // POST /sessions/{id}/submit is NOT intercepted so it hits the real backend, which
        // still has the original 6-minute window → the auto-submit call succeeds.
        await page.route(
            (url) => url.pathname.endsWith(`/sessions/${sessionId}`),
            async (route) => {
                if (route.request().method() !== 'GET') {
                    await route.continue();
                    return;
                }
                const response = await route.fetch();
                const body = await response.json();
                await route.fulfill({
                    response,
                    json: { ...body, expires_at: new Date(Date.now() + 1500).toISOString() },
                });
            }
        );

        // Reload so the exam timer initialises with the patched expires_at (~1.5 s window)
        await page.reload();
        await expect(page.getByText(firstMathPrompt, { exact: true })).toBeVisible();

        // Core assertion: the timer fires after ~1.5 s and calls submitExam automatically.
        // Without the fix this shows "Time Expired" and the session stays STARTED/EXPIRED
        // (invisible to graders). With the fix it shows the submission confirmation page.
        await expect(page.getByText('Exam Submitted Successfully')).toBeVisible({ timeout: 8000 });

        // Grading integration: the auto-submitted session must appear in the dashboard.
        await page.goto('/grading');
        await expect(page.getByRole('heading', { name: 'Grading Dashboard' })).toBeVisible();
        await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 });
        await expect(
            page.locator('tbody tr').filter({ hasText: 'Constructor E2E' }).first()
        ).toBeVisible({ timeout: 5000 });
    });

    test('latest answer still wins when autosave is already in flight', async ({ page }) => {
        const heartbeatPayloads: string[] = [];
        let releaseFirstHeartbeat: (() => void) | null = null;
        let firstHeartbeatBlocked = false;

        await page.route('**/api/sessions/*/heartbeat', async (route) => {
            heartbeatPayloads.push(route.request().postData() ?? '');

            if (!firstHeartbeatBlocked) {
                firstHeartbeatBlocked = true;
                await new Promise<void>((resolve) => {
                    releaseFirstHeartbeat = resolve;
                });
            }

            await route.continue();
        });

        await loginAs(page, 'constructor');
        await page.goto('/sessions', { timeout: 30000 });
        await expect(page.getByRole('heading', { name: 'Exam Windows by Course' })).toBeVisible();
        const practiceRow = page.locator('tr').filter({ hasText: mathCourseCode }).filter({ hasText: mathBlueprint }).first();
        await expect(practiceRow.getByRole('button', { name: 'Practice' })).toBeVisible();
        await practiceRow.getByRole('button', { name: 'Practice' }).click();
        await expect(page).toHaveURL(/\/exam\/.+/);

        const sessionId = page.url().split('/exam/')[1];
        await expect(page.getByText(firstMathPrompt, { exact: true })).toBeVisible();

        await page.locator('label').filter({ hasText: '8 rolls' }).first().click();
        await expect(page.getByText('Saving...')).toBeVisible({ timeout: 7000 });

        await page.locator('label').filter({ hasText: '12 rolls' }).first().click();
        releaseFirstHeartbeat?.();

        await expect.poll(() => heartbeatPayloads.length, { timeout: 10000 }).toBe(2);

        const firstHeartbeat = JSON.parse(heartbeatPayloads[0]);
        const secondHeartbeat = JSON.parse(heartbeatPayloads[1]);
        expect(firstHeartbeat.events[0].payload.selected_option_id).toBe('B');
        expect(secondHeartbeat.events[0].payload.selected_option_id).toBe('A');

        await expect(page.getByText('Saved')).toBeVisible({ timeout: 10000 });

        await page.getByRole('button', { name: 'Submit Exam' }).click();
        await page.getByRole('button', { name: 'Confirm Submission' }).click();

        await page.goto(`/grading/${sessionId}`);
        const firstCard = page.locator('div.bg-gray-900.border.rounded-xl').filter({ hasText: firstMathPrompt }).first();
        await expect(firstCard.getByText('✓ CORRECT')).toBeVisible();
        await expect(firstCard.getByText('Score: 1 / 1 pts')).toBeVisible();
    });
});

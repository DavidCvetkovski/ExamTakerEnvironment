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

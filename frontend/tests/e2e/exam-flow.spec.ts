import { test, expect } from '@playwright/test';
import { loginAs, seedE2EData } from './helpers';

test.describe('Exam Lifecycle E2E', () => {

    test.beforeAll(async () => {
        seedE2EData();
    });

    test('staff practice attempts return to the session manager after submission', async ({ page }) => {
        await loginAs(page, 'constructor');
        await page.goto('/sessions', { timeout: 30000 });
        await expect(page.getByRole('heading', { name: 'Exam Windows by Course' })).toBeVisible();

        await page.getByRole('button', { name: 'Practice' }).first().click();
        await expect(page).toHaveURL(/\/exam\/.+/);
        await expect(page.getByText('Algebra Question 1?', { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(page.getByText('Calculus Question 2?', { exact: true })).toBeVisible();

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
        await expect(page.getByRole('button', { name: 'Practice' }).first()).toBeVisible();
        await page.getByRole('button', { name: 'Practice' }).first().click();
        await expect(page).toHaveURL(/\/exam\/.+/);

        const sessionId = page.url().split('/exam/')[1];
        await expect(page.getByText('Algebra Question 1?', { exact: true })).toBeVisible();

        await page.locator('label').filter({ hasText: 'Wrong Answer' }).first().click();
        await expect(page.getByText('Saving...')).toBeVisible({ timeout: 7000 });

        await page.locator('label').filter({ hasText: 'Correct Answer' }).first().click();
        releaseFirstHeartbeat?.();

        await expect.poll(() => heartbeatPayloads.length, { timeout: 10000 }).toBe(2);

        const firstHeartbeat = JSON.parse(heartbeatPayloads[0]);
        const secondHeartbeat = JSON.parse(heartbeatPayloads[1]);
        expect(firstHeartbeat.events[0].payload.selected_option_index).toBe(1);
        expect(secondHeartbeat.events[0].payload.selected_option_index).toBe(0);
        expect(secondHeartbeat.events[0].payload.selected_option_id).toBe('A');

        await expect(page.getByText('Saved')).toBeVisible({ timeout: 10000 });

        await page.getByRole('button', { name: 'Submit Exam' }).click();
        await page.getByRole('button', { name: 'Confirm Submission' }).click();

        await page.goto(`/grading/${sessionId}`);
        const firstCard = page.locator('div.bg-gray-900.border.rounded-xl').filter({ hasText: 'Algebra Question 1?' }).first();
        await expect(firstCard.getByText('✓ CORRECT')).toBeVisible();
        await expect(firstCard.getByText('Score: 1 / 1 pts')).toBeVisible();
    });
});

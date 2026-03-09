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

        await page.getByRole('button', { name: 'Submit Exam' }).click();
        await page.getByRole('button', { name: 'Confirm Submission' }).click();

        const returnButton = page.getByRole('link', { name: 'Back to Session Manager' });
        await expect(returnButton).toBeVisible();
        await returnButton.click();
        await expect(page).toHaveURL(/\/sessions(?:\?.*)?$/);
    });
});

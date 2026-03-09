import { expect, test } from '@playwright/test';

import { loginAs, seedE2EData } from './helpers';

test.describe('Student my exams', () => {
    test.beforeAll(() => {
        seedE2EData();
    });

    test('student only sees assigned exams and returns to My Exams after submission', async ({ page }) => {
        await loginAs(page, 'student');

        await expect(page.getByRole('heading', { name: 'My Exams' })).toBeVisible();
        await expect(page.getByText('Joinable right now')).toBeVisible();
        await expect(page.getByText('Scheduled later')).toBeVisible();
        await expect(page.getByText('Session Manager')).toHaveCount(0);
        await expect(page.getByText('Test Blueprints')).toHaveCount(0);

        const examButtons = page.getByRole('button', { name: /Join|Resume/ });
        await expect(examButtons).toHaveCount(2);
        await expect(examButtons.nth(0)).toBeEnabled();
        await expect(examButtons.nth(1)).toBeDisabled();

        await examButtons.nth(0).click();
        await expect(page).toHaveURL(/\/exam\/.+/);

        await page.getByRole('button', { name: 'Submit Exam' }).click();
        await page.getByRole('button', { name: 'Confirm Submission' }).click();

        const returnButton = page.getByRole('link', { name: 'Back to My Exams' });
        await expect(returnButton).toBeVisible();
        await returnButton.click();

        await expect(page).toHaveURL(/\/my-exams(?:\?.*)?$/);
        await expect(page.getByRole('heading', { name: 'My Exams' })).toBeVisible();
    });
});

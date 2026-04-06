import { expect, test } from '@playwright/test';

import { loginAs, seedE2EData } from './helpers';

const currentBlueprint = 'Shuffle Lab: Numbers in Motion';
const activeMixedBlueprint = 'Mixed Mode: Policy, Data and Writing';
const upcomingScienceBlueprint = 'Science Check: Forces and Reactions';
const upcomingSamplerBlueprint = 'Smart Draw: Cross Subject Sampler';
const firstMathPrompt = 'Math Warm Up: A bakery spends EUR 24 on setup and earns EUR 2 per roll. Break even quantity?';

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

        await expect(page.getByText(currentBlueprint)).toBeVisible();
        await expect(page.getByText(activeMixedBlueprint)).toBeVisible();
        await expect(page.getByText(upcomingScienceBlueprint)).toBeVisible();
        await expect(page.getByText(upcomingSamplerBlueprint)).toBeVisible();

        const currentCard = page.locator('article').filter({ hasText: currentBlueprint }).first();
        await currentCard.getByRole('button', { name: /Join|Resume/ }).click();
        await expect(page).toHaveURL(/\/exam\/.+/);
        await expect(page.getByText(firstMathPrompt, { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Submit Exam' }).click();
        await page.getByRole('button', { name: 'Confirm Submission' }).click();

        const returnButton = page.getByRole('link', { name: 'Back to My Exams' });
        await expect(returnButton).toBeVisible();
        await returnButton.click();

        await expect(page).toHaveURL(/\/my-exams(?:\?.*)?$/);
        await expect(page.getByRole('heading', { name: 'My Exams' })).toBeVisible();
    });
});

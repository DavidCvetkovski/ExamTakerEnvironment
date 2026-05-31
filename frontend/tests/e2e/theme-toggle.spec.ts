import { expect, test } from '@playwright/test';

import { loginAs, seedE2EData } from './helpers';

test.describe('Theme Toggle', () => {
    test.beforeAll(async () => {
        seedE2EData();
    });

    test('student theme choice persists across reload and login', async ({ page }) => {
        await loginAs(page, 'student');

        await expect
            .poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? null))
            .toBe('warm');

        await page.getByRole('button', { name: 'Switch theme' }).click();
        await page.getByRole('button', { name: 'Dark' }).click();

        await expect
            .poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? null))
            .toBe('dark');

        await page.reload();
        await expect
            .poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? null))
            .toBe('dark');

        await page.getByRole('button', { name: 'Switch theme' }).click();
        await page.getByRole('button', { name: 'Cool blue' }).click();

        await expect
            .poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? null))
            .toBe('light-blue');

        await page.getByRole('button', { name: 'Sign Out' }).click();
        await expect(page).toHaveURL(/\/login(?:\?.*)?$/);

        await loginAs(page, 'student');
        await expect
            .poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? null))
            .toBe('light-blue');
    });
});

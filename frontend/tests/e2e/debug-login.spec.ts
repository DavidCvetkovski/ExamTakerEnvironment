import { test, expect } from '@playwright/test';
import { loginAs, seedE2EData } from './helpers';

test('debug login flow', async ({ page }) => {
    seedE2EData();
    await loginAs(page, 'admin');
    await expect(page).toHaveURL(/\/sessions(?:\?.*)?$/);

    // Check if we are still authenticated after reload
    await page.reload();
    await expect(page).toHaveURL(/\/sessions(?:\?.*)?$/);
});

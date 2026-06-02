import { test, expect } from '@playwright/test';
import { loginAs, seedE2EData } from './helpers';

test.describe('Epoch 11 — SEB & proctoring', () => {
    test.beforeAll(() => {
        seedE2EData();
    });

    test('staff can enable Safe Exam Browser on a blueprint', async ({ page }) => {
        await loginAs(page, 'admin');
        await page.goto('/blueprint');
        await page.getByRole('button', { name: /New Blueprint/i }).click();
        await page.fill('input[placeholder="Untitled Blueprint"]', `Proctored ${Date.now()}`);

        // Open the Security & Proctoring panel and require SEB.
        await page.getByRole('button', { name: /Security & Proctoring/i }).click();
        const sebToggle = page.getByRole('switch', { name: 'Require Safe Exam Browser' });
        await expect(sebToggle).toHaveAttribute('aria-checked', 'false');
        await sebToggle.click();
        await expect(sebToggle).toHaveAttribute('aria-checked', 'true');

        // The collapsed-header summary chip reflects the new policy.
        await expect(page.getByText('SEB required')).toBeVisible();
    });

    test('students cannot reach the supervisor monitor', async ({ page }) => {
        await loginAs(page, 'student');
        // ProtectedRoute restricts the monitor to CONSTRUCTOR/ADMIN; a student is
        // bounced away and never sees the monitor heading.
        await page.goto('/sessions/00000000-0000-0000-0000-000000000000/monitor');
        await expect(page.getByRole('heading', { name: 'Exam monitor' })).toHaveCount(0);
        await expect(page).not.toHaveURL(/\/monitor$/);
    });
});

import { test, expect } from '@playwright/test';
import { loginAs, seedE2EData } from './helpers';

/**
 * Exercises the Epoch 11 supervisor monitor against the seeded ONGOING run
 * (Programming Foundations - Intro Midterm), which has two live attempts
 * (alex + maya) and pre-seeded proctoring incidents.
 */
test.describe('Supervisor monitor', () => {
    test.beforeAll(() => {
        seedE2EData();
    });

    test.beforeEach(async ({ page }) => {
        await loginAs(page, 'admin');
    });

    async function openMonitor(page: import('@playwright/test').Page) {
        // The ongoing row is the only one with a Monitor button.
        await page.getByRole('button', { name: 'Monitor' }).first().click();
        await expect(page).toHaveURL(/\/sessions\/[^/]+\/monitor$/);
        await expect(page.getByRole('heading', { name: 'Exam monitor' })).toBeVisible();
    }

    test('lists live attempts with presence and warning counts', async ({ page }) => {
        await openMonitor(page);

        // Both seeded live students appear.
        await expect(page.getByText('alex.student@vu.nl')).toBeVisible();
        await expect(page.getByText('maya.student@vu.nl')).toBeVisible();

        // alex is flagged (a CRITICAL device-fingerprint incident was seeded).
        const alexRow = page.locator('tr', { hasText: 'alex.student@vu.nl' });
        await expect(alexRow.getByText('Flagged for review')).toBeVisible();

        // The incident feed shows the student email per warning.
        await expect(page.getByText('Incidents')).toBeVisible();
        await expect(page.getByText('alex.student@vu.nl').first()).toBeVisible();
    });

    test('columns are sortable', async ({ page }) => {
        await openMonitor(page);
        const warningsHeader = page.getByRole('button', { name: /^Warnings/ });
        await warningsHeader.click(); // ascending
        await expect(warningsHeader).toContainText('↑');
        await warningsHeader.click(); // descending
        await expect(warningsHeader).toContainText('↓');
    });

    test('clicking a student opens a detail drawer with their warnings', async ({ page }) => {
        await openMonitor(page);

        await page.locator('tr', { hasText: 'alex.student@vu.nl' }).click();

        await expect(page.getByText('Student detail')).toBeVisible();
        await expect(page.getByText('Warnings & incidents')).toBeVisible();
        // The seeded CRITICAL incident type, humanized.
        await expect(page.getByText('Device fingerprint mismatch')).toBeVisible();
    });

    test('students cannot reach the monitor', async ({ page, context }) => {
        // Capture the monitor URL as admin, then try it as a student.
        await openMonitor(page);
        const monitorUrl = page.url();

        await context.clearCookies();
        await page.evaluate(() => localStorage.clear());
        await loginAs(page, 'student');
        await page.goto(monitorUrl);
        await expect(page.getByRole('heading', { name: 'Exam monitor' })).toHaveCount(0);
        await expect(page).not.toHaveURL(/\/monitor$/);
    });
});

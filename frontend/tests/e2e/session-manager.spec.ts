import { expect, test } from '@playwright/test';

import { loginAs, seedE2EData, toDateTimeLocalValue } from './helpers';

test.describe('Session manager', () => {
    test.beforeAll(() => {
        seedE2EData();
    });

    test('constructor can create a course and schedule a future session', async ({ page }) => {
        const courseCode = `AUTO-${Date.now()}`;
        const courseTitle = 'Automation Systems';

        await loginAs(page, 'constructor');
        await expect(page.getByRole('heading', { name: 'Schedule an Exam Window' })).toBeVisible();

        await page.getByLabel('Course code').fill(courseCode);
        await page.getByLabel('Course title').fill(courseTitle);
        await page.getByRole('button', { name: 'Create Course' }).click();

        await page.getByRole('combobox', { name: /^Course$/ }).selectOption({ label: `${courseCode} - ${courseTitle}` });
        await page.getByRole('combobox', { name: /^Blueprint$/ }).selectOption({ label: 'Scheduled Midterm' });
        await page.getByLabel('Start date and time').fill(
            toDateTimeLocalValue(new Date(Date.now() + 2 * 60 * 60 * 1000))
        );

        await page.getByRole('button', { name: 'Schedule Session' }).click();

        const row = page.locator('tr').filter({ hasText: courseCode });
        await expect(row).toContainText('Scheduled Midterm');
        await expect(row).toContainText(courseTitle);
    });

    test('student is redirected away from the staff scheduler', async ({ page }) => {
        await loginAs(page, 'student');
        await page.goto('/sessions');
        await expect(page).toHaveURL(/\/my-exams(?:\?.*)?$/);
        await expect(page.getByRole('heading', { name: 'My Exams' })).toBeVisible();
    });
});

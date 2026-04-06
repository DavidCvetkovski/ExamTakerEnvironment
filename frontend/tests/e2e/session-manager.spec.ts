import { expect, test } from '@playwright/test';

import { loginAs, seedE2EData } from './helpers';

test.describe('Session manager', () => {
    test.beforeAll(() => {
        seedE2EData();
    });

    test('admin can create a course and schedule a future session', async ({ page }) => {
        const courseCode = `AUTO-${Date.now()}`;
        const courseTitle = 'Automation Systems';

        await loginAs(page, 'admin');
        await expect(page.getByRole('heading', { name: 'Schedule an Exam Window' })).toBeVisible();
        await expect(page.getByRole('combobox', { name: /^Blueprint$/ })).toContainText('Scheduled Midterm');

        await page.getByLabel('Course code').fill(courseCode);
        await page.getByLabel('Course title').fill(courseTitle);
        await page.getByRole('button', { name: 'Create Course' }).click();

        await expect(page.getByRole('combobox', { name: /^Course$/ })).toContainText(`${courseCode} - ${courseTitle}`);
        await page.getByRole('combobox', { name: /^Course$/ }).selectOption({ label: `${courseCode} - ${courseTitle}` });
        await page.getByRole('combobox', { name: /^Blueprint$/ }).selectOption({ label: 'Scheduled Midterm' });

        const startsAt = page.getByLabel('Start date and time');
        const futureQuarterHour = await page.evaluate((value) => {
            const date = new Date(value);
            date.setHours(date.getHours() + 2);

            const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
            return localDate.toISOString().slice(0, 16);
        }, await startsAt.inputValue());
        await startsAt.fill(futureQuarterHour);

        await page.getByRole('button', { name: 'Schedule Session' }).click();

        const row = page.locator('tr').filter({ hasText: courseCode });
        await expect(row).toContainText('Scheduled Midterm');
        await expect(row).toContainText(courseTitle);
    });

    test('constructor only sees the scheduler with a browser-local default start time', async ({ page }) => {
        await loginAs(page, 'constructor');
        await expect(page.getByRole('heading', { name: 'Schedule an Exam Window' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Create a New Course' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Create Course' })).toHaveCount(0);

        const browserTimeZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
        await expect(page.getByText(/All times are scheduled based on your timezone/)).toContainText(browserTimeZone);

        const startsAt = page.getByLabel('Start date and time');
        await expect(startsAt).not.toHaveValue('');

        const isRoundedUpcomingQuarterHour = await page.evaluate((value) => {
            if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
                return false;
            }

            const selected = new Date(value);
            const now = new Date();
            const diffMs = selected.getTime() - now.getTime();
            const minute = selected.getMinutes();

            return [0, 15, 30, 45].includes(minute) && diffMs >= -60_000 && diffMs <= 15 * 60_000;
        }, await startsAt.inputValue());

        expect(isRoundedUpcomingQuarterHour).toBeTruthy();
    });

    test('student is redirected away from the staff scheduler', async ({ page }) => {
        await loginAs(page, 'student');
        await page.goto('/sessions');
        await expect(page).toHaveURL(/\/my-exams(?:\?.*)?$/);
        await expect(page.getByRole('heading', { name: 'My Exams' })).toBeVisible();
    });
});

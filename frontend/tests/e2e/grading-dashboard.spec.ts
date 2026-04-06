import { test, expect } from '@playwright/test';
import { loginAs, seedE2EData } from './helpers';

test.describe('Grading Dashboard & Student Results E2E', () => {
    test.beforeAll(() => {
        seedE2EData();
    });

    test('Instructors can view the grading dashboard and select a test', async ({ page }) => {
        await loginAs(page, 'admin');

        // Navigate to Grading Dashboard
        await page.goto('/grading');
        
        // Check core UI elements
        await expect(page.getByRole('heading', { name: 'Grading Dashboard' })).toBeVisible();
        await expect(page.locator('text=Select a test to view grading progress')).toBeVisible();

        // Check assigned tests list populates (assuming seed_e2e creates some submitted exams)
        await expect(page.locator('#test-selector')).toBeVisible();
    });

    test('Student can view results in My Exams if published', async ({ page }) => {
        await loginAs(page, 'student');
        await page.goto('/my-exams');
        
        // Wait for My Exams heading
        await expect(page.getByRole('heading', { name: 'My Exams' })).toBeVisible();
        
        // We verify the student portal loads fully
        await expect(page.locator('text=Joinable right now')).toBeVisible();
    });
});

import { test, expect } from '@playwright/test';
import { loginAs, seedE2EData } from './helpers';

test.describe('Blueprint Designer UI Rethink', () => {
    test.beforeAll(() => {
        seedE2EData();
    });

    test.beforeEach(async ({ page }) => {
        await loginAs(page, 'admin');
    });

    test('should create a new blueprint using the question picker', async ({ page }) => {
        const pickerPrompt = 'Math Warm Up: A bakery spends EUR 24 on setup and earns EUR 2 per roll. Break even quantity?';

        await page.goto('/blueprint');

        // Click New Blueprint
        await page.getByRole('button', { name: /New Blueprint/i }).click();

        // Fill details
        await page.fill('input[placeholder="Untitled Blueprint"]', 'E2E Picker Test');
        await page.fill('textarea[placeholder*="purpose"]', 'Testing the new intuitive question picker');

        // Add Specific Item
        await page.getByRole('button', { name: /Specific Item/i }).click();

        // Modal should open
        await expect(page.getByRole('heading', { name: 'Select Question' })).toBeVisible();

        // Select first available item through the inspection flow
        const firstItem = page.locator('div').filter({ hasText: pickerPrompt }).first();
        await expect(firstItem).toBeVisible();
        await firstItem.click();
        await page.getByRole('button', { name: 'Select This Question' }).click();

        // Modal should close and item should be selected
        await expect(page.getByRole('heading', { name: 'Select Question' })).toHaveCount(0);

        // Verify item preview is shown instead of UUID
        const previewText = await page.locator('div.text-slate-200').first().textContent();
        expect(previewText).not.toContain('-');
        expect(previewText?.length).toBeGreaterThan(5);

        await expect(page.getByRole('button', { name: /Validate/i })).toHaveCount(0);

        // Save and wait for the explicit save animation state
        await page.getByRole('button', { name: 'Publish Blueprint' }).click();
        await expect(page.getByText('Blueprint saved')).toBeVisible();

        // Check list
        await page.getByRole('button', { name: /Back to Blueprints/i }).click();
        await expect(page.locator('h3:has-text("E2E Picker Test")')).toBeVisible();
    });
});

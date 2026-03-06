import { test, expect } from '@playwright/test';

test.describe('Blueprint Designer UI Rethink', () => {
    test.beforeEach(async ({ page }) => {
        // Login
        await page.goto('http://localhost:3000/login');

        // Wait for loading to finish
        await page.waitForSelector('#email');

        await page.locator('#email').fill('admin_e2e@vu.nl');
        await page.locator('#password').fill('adminpass123');
        await page.locator('button', { hasText: /^Sign In$/ }).click();

        // Wait for redirect to library (/items)
        await expect(page).toHaveURL(/.*items/, { timeout: 20000 });
    });

    test('should create a new blueprint using the question picker', async ({ page }) => {
        await page.goto('http://localhost:3000/blueprint');

        // Click New Blueprint
        await page.click('button:has-text("New Blueprint")');

        // Fill details
        await page.fill('input[placeholder="Untitled Blueprint"]', 'E2E Picker Test');
        await page.fill('textarea[placeholder*="purpose"]', 'Testing the new intuitive question picker');

        // Add Section
        await page.click('button:has-text("Add New Section")');

        // Add Specific Item
        await page.click('button:has-text("Specific Item")');

        // Modal should open
        await expect(page.locator('h2:has-text("Select Question")')).toBeVisible();

        // Select first available item
        const firstItem = page.locator('div[style*="cursor: pointer"]').first();
        await expect(firstItem).toBeVisible();
        await firstItem.click();

        // Modal should close and item should be selected
        await expect(page.locator('h2:has-text("Select Question")')).not.toBeVisible();

        // Verify item preview is shown instead of UUID
        const previewText = await page.locator('div:has-text("Specific Item")').locator('..').locator('div.text-slate-200').textContent();
        expect(previewText).not.toContain('-'); // UUIDs usually have dashes, previews usually don't or are short
        expect(previewText?.length).toBeGreaterThan(5);

        // Save
        await page.click('button:has-text("Publish")');

        // Check list
        await page.click('button:has-text("Back to Blueprints")');
        await expect(page.locator('h3:has-text("E2E Picker Test")')).toBeVisible();
    });
});

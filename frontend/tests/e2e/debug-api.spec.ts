import { test, expect } from '@playwright/test';

test('debug: inspect API response for versions', async ({ page }) => {
    // Capture all API responses
    const apiResponses: Record<string, unknown>[] = [];

    page.on('response', async (response) => {
        if (response.url().includes('/api/')) {
            try {
                const body = await response.json();
                apiResponses.push({
                    url: response.url(),
                    status: response.status(),
                    body
                });
            } catch {
                // ignore non-JSON
            }
        }
    });

    // 1. Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin_e2e@vu.nl');
    await page.fill('input[type="password"]', 'adminpass123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/items/, { timeout: 10000 });

    // 2. Get learning objects list
    await page.waitForTimeout(1000);
    console.log('=== API Responses on /items page ===');
    console.log(JSON.stringify(apiResponses, null, 2));

    // 3. Click Edit on first item
    const editBtn = page.locator('table tbody tr:first-child button:has-text("Edit")');
    await editBtn.click();
    await expect(page).toHaveURL(/.*\/author\?lo_id=.*/, { timeout: 5000 });

    // Wait for data fetch
    await page.waitForTimeout(3000);

    console.log('=== API Responses after navigating to /author ===');
    console.log(JSON.stringify(apiResponses, null, 2));

    // 4. Check editor
    const editor = page.locator('.ProseMirror');
    await expect(editor).toBeVisible();
    const editorText = await editor.innerText();
    console.log('=== Editor content ===');
    console.log(editorText);

    await page.screenshot({ path: 'test-results/debug-api.png', fullPage: true });
});

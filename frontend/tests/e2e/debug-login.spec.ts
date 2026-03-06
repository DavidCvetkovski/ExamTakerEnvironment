import { test, expect } from '@playwright/test';

test('debug login flow', async ({ page }) => {
    // Go to login
    await page.goto('http://127.0.0.1:3000/login');

    // Wait for the page to load
    await expect(page.locator('h1')).toContainText('OpenVision SSO');

    // Fill in credentials
    await page.fill('input[type="email"]', 'admin_e2e@vu.nl');
    await page.fill('input[type="password"]', 'adminpass123');

    // Intercept the login response
    const [response] = await Promise.all([
        page.waitForResponse(response => response.url().includes('/auth/login')),
        page.click('button[type="submit"]')
    ]);

    console.log(`Login response status: ${response.status()}`);
    const body = await response.json();
    console.log(`Login response body: ${JSON.stringify(body)}`);

    // Wait for redirect
    await page.waitForURL('**/items', { timeout: 10000 });
    console.log(`Successfully redirected to: ${page.url()}`);

    // Check if we are still authenticated after reload
    await page.reload();
    await page.waitForTimeout(2000);

    console.log(`URL after reload: ${page.url()}`);
    if (page.url().includes('/login')) {
        console.error('FAILED: Logged out after reload!');
    } else {
        console.log('SUCCESS: Still logged in after reload.');
    }
});

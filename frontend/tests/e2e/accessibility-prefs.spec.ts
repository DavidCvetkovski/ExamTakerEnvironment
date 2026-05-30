import { APIRequestContext, expect, Page, test } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:8000/api';

/** Register a throwaway student so preference changes never poison shared seeds. */
async function registerStudent(request: APIRequestContext): Promise<{ email: string; password: string }> {
    const email = `a11y-user+${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    const password = 'originalpw123';
    const resp = await request.post(`${API_BASE}/auth/register`, {
        data: { email, password, role: 'STUDENT' },
    });
    expect(resp.status()).toBe(201);
    return { email, password };
}

async function login(page: Page, email: string, password: string): Promise<void> {
    await page.goto('/login');
    await expect(page.getByLabel('Email address')).toBeVisible();
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /^Sign in$/i }).click();
    await expect(page).toHaveURL(/\/my-exams(?:\?.*)?$/, { timeout: 15000 });
}

const a11yAttr = (page: Page, attr: string) =>
    page.evaluate((a) => document.documentElement.getAttribute(a), attr);

test.describe('Accessibility preferences', () => {
    test('dyslexia font toggle applies and persists across reload', async ({ page, request }) => {
        const user = await registerStudent(request);
        await login(page, user.email, user.password);
        await page.goto('/account');

        await page.getByRole('switch', { name: 'Dyslexia-friendly font' }).click();
        await expect.poll(() => a11yAttr(page, 'data-a11y-font')).toBe('dyslexic');

        await page.reload();
        await expect.poll(() => a11yAttr(page, 'data-a11y-font')).toBe('dyslexic');
    });

    test('high contrast and text scale apply', async ({ page, request }) => {
        const user = await registerStudent(request);
        await login(page, user.email, user.password);
        await page.goto('/account');

        await page.getByRole('switch', { name: 'High contrast' }).click();
        await expect.poll(() => a11yAttr(page, 'data-a11y-contrast')).toBe('high');

        await page.getByRole('button', { name: /Extra large/ }).click();
        await expect.poll(() => a11yAttr(page, 'data-a11y-scale')).toBe('xl');
    });

    test('skip link is the first focusable element', async ({ page, request }) => {
        const user = await registerStudent(request);
        await login(page, user.email, user.password);
        await page.goto('/account');

        await page.keyboard.press('Tab');
        const focusedText = await page.evaluate(() => document.activeElement?.textContent ?? '');
        expect(focusedText).toContain('Skip to main content');
    });
});

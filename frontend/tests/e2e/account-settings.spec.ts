import { APIRequestContext, expect, Page, test } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:8000/api';

interface Disposable {
    email: string;
    password: string;
}

/** Register a throwaway STUDENT through the API so each test owns an isolated
 *  account — password changes and deactivation never poison shared seed users
 *  (see directives/e2e_seed_naming_conventions.md on seed isolation). */
async function registerDisposable(request: APIRequestContext): Promise<Disposable> {
    const email = `account-victim+${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    const password = 'originalpw123';
    const resp = await request.post(`${API_BASE}/auth/register`, {
        data: { email, password, role: 'STUDENT' },
    });
    expect(resp.status()).toBe(201);
    return { email, password };
}

async function loginWith(page: Page, user: Disposable): Promise<void> {
    await page.goto('/login');
    await expect(page.getByLabel('Email address')).toBeVisible();
    await page.getByLabel('Email address').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: /^Sign in$/i }).click();
    await expect(page).toHaveURL(/\/my-exams(?:\?.*)?$/, { timeout: 15000 });
}

test.describe('Account settings', () => {
    test('change password succeeds and keeps the session alive', async ({ page, request }) => {
        const user = await registerDisposable(request);
        await loginWith(page, user);
        await page.goto('/account');

        await page.getByLabel('Current password').fill(user.password);
        await page.getByLabel('New password', { exact: true }).fill('brandnewpw456');
        await page.getByLabel('Confirm new password').fill('brandnewpw456');
        await page.getByRole('button', { name: 'Change password' }).click();

        await expect(page.getByText('Password changed')).toBeVisible();
        // Session is still alive — a protected navigation still works.
        await page.goto('/my-exams');
        await expect(page).toHaveURL(/\/my-exams/);
    });

    test('wrong current password shows an inline error, no toast', async ({ page, request }) => {
        const user = await registerDisposable(request);
        await loginWith(page, user);
        await page.goto('/account');

        await page.getByLabel('Current password').fill('definitely-wrong');
        await page.getByLabel('New password', { exact: true }).fill('brandnewpw456');
        await page.getByLabel('Confirm new password').fill('brandnewpw456');
        await page.getByRole('button', { name: 'Change password' }).click();

        await expect(page.getByText('Current password is incorrect.')).toBeVisible();
        await expect(page.getByText('Password changed')).toHaveCount(0);
    });

    test('theme choice on the account page persists across reload', async ({ page, request }) => {
        const user = await registerDisposable(request);
        await loginWith(page, user);
        await page.goto('/account');

        // STUDENT default is warm; pick Dark from the Appearance picker.
        await page.getByRole('button', { name: /^Dark/ }).click();
        await expect
            .poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? null))
            .toBe('dark');

        await page.reload();
        await expect
            .poll(() => page.evaluate(() => document.documentElement.dataset.theme ?? null))
            .toBe('dark');
    });

    test('deactivation signs out and blocks re-login', async ({ page, request }) => {
        const user = await registerDisposable(request);
        await loginWith(page, user);
        await page.goto('/account');

        await page.getByRole('button', { name: 'Deactivate account' }).click();
        await page.getByLabel('Confirm your password').fill(user.password);
        await page.getByRole('button', { name: 'Yes, deactivate' }).click();

        await expect(page).toHaveURL(/\/login(?:\?.*)?$/, { timeout: 15000 });

        // Re-login is refused (deactivated account).
        await page.getByLabel('Email address').fill(user.email);
        await page.getByLabel('Password').fill(user.password);
        await page.getByRole('button', { name: /^Sign in$/i }).click();
        await expect(page).toHaveURL(/\/login/);
    });
});

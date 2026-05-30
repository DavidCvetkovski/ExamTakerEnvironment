import { expect, test } from '@playwright/test';

import { loginAs, seedE2EData } from './helpers';

const API_BASE = 'http://127.0.0.1:8000/api';

test.describe('Accommodations admin', () => {
    test.beforeAll(() => {
        seedE2EData();
    });

    test('admin can set a student provision and see it audited', async ({ page }) => {
        await loginAs(page, 'admin');
        await page.goto('/admin/accommodations');

        // Wait for the students table to load, then edit the first row.
        await expect(page.getByRole('heading', { name: 'Accommodations' })).toBeVisible();
        await page.getByRole('button', { name: 'Edit' }).first().click();

        // Drawer opens with the multiplier field.
        const field = page.getByLabel('Extra-time multiplier');
        await expect(field).toBeVisible();
        await field.fill('1.5');
        await page.getByRole('button', { name: 'Save changes' }).click();

        await expect(page.getByText('Accommodation updated')).toBeVisible();
        // The audit timeline now shows the change.
        await expect(page.getByText(/Extra time:/)).toBeVisible();
    });

    test('non-admin is kept out of the admin route', async ({ page }) => {
        await loginAs(page, 'student');
        await page.goto('/admin/accommodations');
        // ProtectedRoute redirects students to their home.
        await expect(page).toHaveURL(/\/my-exams/, { timeout: 15000 });
    });

    test('the accommodations API rejects non-admins with 403', async ({ request }) => {
        const login = await request.post(`${API_BASE}/auth/login`, {
            data: { email: 'student_e2e@vu.nl', password: 'studentpass123' },
        });
        const token = (await login.json()).access_token;
        const resp = await request.get(`${API_BASE}/accommodations/students`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(resp.status()).toBe(403);
    });
});

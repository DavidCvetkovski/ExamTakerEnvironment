import { execSync } from 'child_process';

import { expect, Page } from '@playwright/test';

type TestRole = 'admin' | 'constructor' | 'student';

const credentials: Record<TestRole, { email: string; password: string; homePath: string }> = {
    admin: {
        email: 'admin_e2e@vu.nl',
        password: 'adminpass123',
        homePath: '/sessions',
    },
    constructor: {
        email: 'constructor_e2e@vu.nl',
        password: 'conpass123',
        homePath: '/sessions',
    },
    student: {
        email: 'student_e2e@vu.nl',
        password: 'studentpass123',
        homePath: '/my-exams',
    },
};

function escapeForRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function seedE2EData(): void {
    execSync(
        'cd ../backend && source .venv/bin/activate && PYTHONPATH=. python3 seed_e2e.py',
        { shell: '/bin/zsh' }
    );
}

export async function loginAs(page: Page, role: TestRole): Promise<void> {
    const account = credentials[role];

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'OpenVision SSO' })).toBeVisible();

    await page.getByLabel('Email Address').fill(account.email);
    await page.getByLabel('Password').fill(account.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(
        new RegExp(`${escapeForRegExp(account.homePath)}(?:\\?.*)?$`),
        { timeout: 15000 }
    );
}

export function toDateTimeLocalValue(date: Date): string {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 16);
}

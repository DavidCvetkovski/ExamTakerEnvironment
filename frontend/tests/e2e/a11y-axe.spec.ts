import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs, seedE2EData } from './helpers';

const mathBlueprint = 'Shuffle Lab: Numbers in Motion';
const mathCourseCode = 'MATH-140';
const firstMathPrompt = 'Math Warm Up: A bakery spends EUR 24 on setup and earns EUR 2 per roll. Break even quantity?';

/** WCAG 2.1 A/AA tags — the conformance target for the Epoch 10 V gate. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Run axe against the current page and assert no serious/critical violations.
 *  Minor/moderate findings are surfaced in the report but don't fail the gate
 *  (CLAUDE.md §6 / blueprint §6: zero serious or critical). */
async function expectNoSeriousA11yViolations(page: import('@playwright/test').Page, context: string) {
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    const blocking = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(
        blocking,
        `Serious/critical a11y violations on ${context}:\n` +
            blocking.map((v) => `  - ${v.id} (${v.impact}): ${v.help}`).join('\n'),
    ).toEqual([]);
}

/**
 * Epoch 10, V gate — automated accessibility checks on the key routes
 * (blueprint §5.5): /login, /account, the exam screen, and
 * /admin/accommodations. Asserts zero serious/critical axe-core violations.
 */
test.describe('Accessibility — axe-core (Epoch 10 V gate)', () => {
    test.beforeAll(async () => {
        seedE2EData();
    });

    test('/login has no serious a11y violations', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByLabel('Email address')).toBeVisible();
        await expectNoSeriousA11yViolations(page, '/login');
    });

    test('/account has no serious a11y violations', async ({ page }) => {
        await loginAs(page, 'student');
        await page.goto('/account');
        await expect(page.getByRole('heading', { name: /account/i }).first()).toBeVisible();
        await expectNoSeriousA11yViolations(page, '/account');
    });

    test('/admin/accommodations has no serious a11y violations', async ({ page }) => {
        await loginAs(page, 'admin');
        await page.goto('/admin/accommodations');
        await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 });
        await expectNoSeriousA11yViolations(page, '/admin/accommodations');
    });

    test('exam screen has no serious a11y violations', async ({ page }) => {
        await loginAs(page, 'constructor');
        await page.goto('/sessions', { timeout: 30000 });
        const practiceRow = page
            .locator('tr')
            .filter({ hasText: mathCourseCode })
            .filter({ hasText: mathBlueprint })
            .first();
        await practiceRow.getByRole('button', { name: 'Practice' }).click();
        await expect(page.getByText(firstMathPrompt, { exact: true })).toBeVisible();
        await expectNoSeriousA11yViolations(page, 'exam screen');
    });
});

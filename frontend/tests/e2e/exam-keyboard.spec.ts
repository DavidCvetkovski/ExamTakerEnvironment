import { test, expect } from '@playwright/test';
import { loginAs, seedE2EData } from './helpers';

// Mirrors exam-flow.spec.ts so we drive the same seeded practice session.
const mathBlueprint = 'Shuffle Lab: Numbers in Motion';
const mathCourseCode = 'MATH-140';
const firstMathPrompt = 'Math Warm Up: A bakery spends EUR 24 on setup and earns EUR 2 per roll. Break even quantity?';
const secondMathPrompt = 'Calculus Check: For f(x) = x^2, what is the slope of the tangent at x = 3?';

/**
 * Epoch 10, F2 — keyboard & screen-reader support.
 *
 * Proves the exam surface is operable by keyboard alone: native radio-group
 * selection, the `f` flag shortcut (with a live-region announcement), the `?`
 * shortcuts help dialog, and arrow-key question navigation.
 */
test.describe('Exam keyboard & screen-reader support (Epoch 10)', () => {
    test.beforeAll(async () => {
        seedE2EData();
    });

    test('keyboard-only: select an answer, flag, open help, and navigate', async ({ page }) => {
        await loginAs(page, 'constructor');
        await page.goto('/sessions', { timeout: 30000 });
        await expect(page.getByRole('heading', { name: 'Exam Windows by Course' })).toBeVisible();

        const practiceRow = page
            .locator('tr')
            .filter({ hasText: mathCourseCode })
            .filter({ hasText: mathBlueprint })
            .first();
        await practiceRow.getByRole('button', { name: 'Practice' }).click();
        await expect(page).toHaveURL(/\/exam\/.+/);
        await expect(page.getByText(firstMathPrompt, { exact: true })).toBeVisible();

        // 1) Select an MCQ option with the keyboard. The page-level arrow handler
        //    yields to native radio behaviour while a radio is focused.
        const firstOption = page.getByRole('radio').first();
        await firstOption.focus();
        await page.keyboard.press('Space');
        await expect(firstOption).toBeChecked();

        // 2) Flag the current question via the `f` shortcut. Focus a non-field
        //    control first so the handler runs (it ignores inputs/textareas).
        await page.getByRole('button', { name: 'Keyboard shortcuts' }).focus();
        await page.keyboard.press('f');
        await expect(
            page.getByRole('status').filter({ hasText: 'Question 1 flagged' }),
        ).toBeVisible();
        await expect(page.getByRole('button', { name: 'Flagged' })).toBeVisible();

        // 3) Open the shortcuts help with `?` and close it with Escape.
        await page.keyboard.press('Shift+/');
        await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden();

        // 4) Navigate to the next question with ArrowRight.
        await page.keyboard.press('ArrowRight');
        await expect(page.getByText(secondMathPrompt, { exact: true })).toBeVisible();
    });
});

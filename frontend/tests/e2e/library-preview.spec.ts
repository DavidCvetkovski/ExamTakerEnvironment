import { test, expect } from '@playwright/test';
import { loginAs, seedE2EData } from './helpers';

test('verify library previews show clean text, not JSON', async ({ page }) => {
    const previewPrompt = 'Calculus Check: For f(x) = x^2, what is the slope of the tangent at x = 3?';

    seedE2EData();
    await loginAs(page, 'admin');
    await page.goto('/items');

    // 3. Check the preview column
    // The user output showed: {'text': 'Math Question 1?'}...
    // We want to see: Math Question 1?

    const previewRow = page.locator('table tbody tr').filter({ hasText: previewPrompt }).first();
    const previewCell = previewRow.locator('td:first-child div:first-child');
    await expect(previewCell).toBeVisible();

    const previewText = await previewCell.innerText();
    console.log('Detected preview text:', previewText);

    // It should NOT contain curly braces or 'text' key string
    expect(previewText).not.toContain('{');
    expect(previewText).not.toContain("'text'");
    expect(previewText).toContain('Calculus Check');

    // 4. Click Edit and verify content loads in editor
    await previewRow.hover();
    await previewRow.getByRole('button', { name: 'Edit' }).click();

    await expect(page).toHaveURL(/.*\/author\?lo_id=.*/);

    // TipTap editor usually has a content area
    const editor = page.locator('.ProseMirror');
    await expect(editor).toBeVisible();
});

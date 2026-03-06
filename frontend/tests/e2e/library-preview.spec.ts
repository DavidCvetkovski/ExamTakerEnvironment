import { test, expect } from '@playwright/test';

test('verify library previews show clean text, not JSON', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin_e2e@vu.nl');
    await page.fill('input[type="password"]', 'adminpass123');
    await page.click('button[type="submit"]');

    // 2. Wait for redirect to library
    await expect(page).toHaveURL(/.*\/items/);

    // 3. Check the preview column
    // The user output showed: {'text': 'Math Question 1?'}...
    // We want to see: Math Question 1?

    const firstRowPreview = page.locator('table tbody tr:first-child td:first-child div:first-child');
    await expect(firstRowPreview).toBeVisible();

    const previewText = await firstRowPreview.innerText();
    console.log('Detected preview text:', previewText);

    // It should NOT contain curly braces or 'text' key string
    expect(previewText).not.toContain('{');
    expect(previewText).not.toContain("'text'");
    expect(previewText).toContain('Math Question');

    // 4. Click Edit and verify content loads in editor
    await page.locator('table tbody tr:first-child').hover();
    await page.click('table tbody tr:first-child button:has-text("Edit")');

    await expect(page).toHaveURL(/.*\/author\?lo_id=.*/);

    // Wait for editor to load content
    // TipTap editor usually has a content area
    const editor = page.locator('.ProseMirror');
    await expect(editor).toBeVisible();

    // Check if the content is loaded (not just empty)
    const editorText = await editor.innerText();
    console.log('Detected editor content:', editorText);
    expect(editorText.length).toBeGreaterThan(0);
    expect(editorText).toContain('Math Question');
});

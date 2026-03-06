import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('Exam Lifecycle E2E', () => {

    test.beforeAll(async () => {
        // Seed the database before tests
        console.log('Seeding database...');
        execSync('cd ../backend && source .venv/bin/activate && PYTHONPATH=. python3 seed_e2e.py', { shell: '/bin/zsh' });
    });

    test('Full flow: Create Blueprint -> Student Login -> Start Exam with Accommodation', async ({ page }) => {
        // 1. Login as Admin
        await page.goto('/login', { timeout: 30000 });
        await page.fill('input[type="email"]', 'admin_e2e@vu.nl');
        await page.fill('input[type="password"]', 'adminpass123');
        await page.click('button:has-text("Sign In")');
        await expect(page).toHaveURL('/items');

        // 2. Go to Blueprint Designer
        await page.goto('/blueprint', { timeout: 30000 });
        await page.click('button:has-text("New Blueprint")');

        // 3. Define Blueprint
        await page.fill('input[placeholder="Blueprint Title"]', 'E2E Timed Exam');
        // Set duration to 10 minutes
        const durationInput = page.locator('input[type="number"]').first();
        await durationInput.fill('10');

        // Add Random Rule
        await page.click('button:has-text("Add New Section")');
        await page.click('button:has-text("Add Random")');

        // Configure rule: 2 items with 'math' tag
        await page.fill('input[type="number"] >> nth=1', '2');
        await page.fill('input[placeholder="Tags (comma separated)"]', 'math');

        // Save
        await page.click('button:has-text("Save Blueprint")');
        // Wait for save (simple timeout or check for toast/redirect)
        await page.waitForTimeout(2000);

        // 4. Logout
        // Click the Sign Out button in the Global Header
        await page.click('button:has-text("Sign Out")');
        await expect(page).toHaveURL(/.*login/);

        // 5. Login as Student (with 1.25x multiplier)
        await page.fill('input[type="email"]', 'student_e2e@vu.nl');
        await page.fill('input[type="password"]', 'studentpass123');
        await page.click('button:has-text("Sign In")');
        await expect(page).toHaveURL('/items');

        // 6. Go to Blueprint list to start test
        await page.goto('/blueprint', { timeout: 30000 });
        // Find the blueprint we just created and click it
        await page.click('h3:has-text("E2E Timed Exam")');
        await page.waitForTimeout(1000); // wait for edit view to load
        await page.click('button:has-text("Start Test")');

        // 7. Verify Exam Page & Timer
        // Should redirect to /exam/[id]
        await expect(page).toHaveURL(/\/exam\/.+/);

        // Verify 2 questions are rendered
        const questions = page.locator('section');
        await expect(questions).toHaveCount(2);

        // Verify Timer: 10 mins * 1.25 = 12m 30s
        // The timer format is "Xm Ys"
        const timer = page.locator('p.font-mono');
        await expect(timer).toContainText('12m');
        console.log('Timer verified for 1.25x accommodation');
    });
});

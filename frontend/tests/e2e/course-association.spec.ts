import { expect, test } from '@playwright/test';

import { loginAs, seedE2EData } from './helpers';

// Epoch 8.9.1 — course association across blueprints, scheduling, and library.
//
// Stable seed facts (seed_e2e.py + seed_data/curriculum.py):
//  - "Data Structures and Algorithms" (CS-202) has assigned blueprints, incl.
//    "Data Structures and Algorithms - Final".
//  - "Programming Foundations - Intro Midterm" is Unassigned (cross-course).
//  - "Database Systems - SQL Quiz" belongs to a different course (CS-305).
//  - CS-202 items include the topic "Hashing" but not "Logic"; DM-120
//    ("Discrete Mathematics") includes "Logic" but not "Hashing".

const DS_COURSE = 'Data Structures and Algorithms';
const DM_COURSE = 'Discrete Mathematics';
const DS_BLUEPRINT = 'Data Structures and Algorithms - Final';
const UNASSIGNED_BLUEPRINT = 'Programming Foundations - Intro Midterm';
const OTHER_COURSE_BLUEPRINT = 'Database Systems - SQL Quiz';

test.describe('Course association (Epoch 8.9.1)', () => {
    test.beforeAll(() => {
        seedE2EData();
    });

    test('F2: blueprint list filters by course and by Unassigned', async ({ page }) => {
        await loginAs(page, 'admin');
        await page.goto('/blueprint');

        // Wait for the list to populate.
        await expect(page.getByText(DS_BLUEPRINT)).toBeVisible();

        const courseFilter = page.getByRole('combobox', { name: 'Filter by course' });

        // Filter to the DS course → DS blueprint visible, unassigned one hidden.
        await courseFilter.selectOption({ label: DS_COURSE });
        await expect(page.getByText(DS_BLUEPRINT)).toBeVisible();
        await expect(page.getByText(UNASSIGNED_BLUEPRINT)).toHaveCount(0);

        // Filter to Unassigned → the cross-course blueprint shows, DS one hidden.
        await courseFilter.selectOption({ label: 'Unassigned' });
        await expect(page.getByText(UNASSIGNED_BLUEPRINT)).toBeVisible();
        await expect(page.getByText(DS_BLUEPRINT)).toHaveCount(0);
    });

    test('F3: session blueprint picker is gated on course and scoped correctly', async ({ page }) => {
        await loginAs(page, 'admin');
        await expect(page.getByRole('heading', { name: 'Schedule an Exam Window' })).toBeVisible();

        const blueprint = page.getByRole('combobox', { name: /^Blueprint$/ });
        const course = page.getByRole('combobox', { name: /^Course$/ });

        // Disabled until a course is chosen.
        await expect(blueprint).toBeDisabled();

        await course.selectOption({ label: DS_COURSE });
        await expect(blueprint).toBeEnabled();

        // Shows this course's blueprints + unassigned ones, not other courses'.
        await expect(blueprint).toContainText(DS_BLUEPRINT);
        await expect(blueprint).toContainText(UNASSIGNED_BLUEPRINT);
        await expect(blueprint).not.toContainText(OTHER_COURSE_BLUEPRINT);
    });

    test('F4: library topic filter only lists topics for the selected course', async ({ page }) => {
        await loginAs(page, 'admin');
        await page.goto('/items');

        const courseFilter = page.getByRole('combobox', { name: 'Filter by course' });
        const topicFilter = page.getByRole('combobox', { name: 'Filter by topic' });
        await expect(courseFilter).toBeVisible();

        // DS course → "Hashing" present, "Logic" absent.
        await courseFilter.selectOption({ label: DS_COURSE });
        await expect(topicFilter).toContainText('Hashing');
        await expect(topicFilter).not.toContainText('Logic');

        // Switch to Discrete Maths → "Logic" present, "Hashing" absent.
        await courseFilter.selectOption({ label: DM_COURSE });
        await expect(topicFilter).toContainText('Logic');
        await expect(topicFilter).not.toContainText('Hashing');
    });

    // Note: F1 (the editor Course selector + persistence on create/update) is
    // covered authoritatively by backend integration tests
    // (backend/tests/test_blueprint_course.py). It is intentionally not retested
    // here because most seeded blueprints are locked (ONGOING/PASSED) and render
    // read-only, which would make an edit-existing E2E flaky.
});

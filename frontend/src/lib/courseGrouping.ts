/**
 * Generic course bucketing for list surfaces (Epoch 14.1).
 *
 * `/grading` and `/analytics` each group their index by course; the blueprint
 * list now does too. Rather than hand-roll the bucketing a third time inline
 * (past the §2 "three is the limit" threshold), the shared shape lives here.
 *
 * Pure: rows in, ordered groups out. The caller supplies accessors so the
 * helper stays agnostic to the row type. Rows with no course collapse into a
 * single trailing group (label configurable, default "Unassigned").
 */

export interface CourseGroup<T> {
    /** The course id, or `null` for the trailing unassigned bucket. */
    courseId: string | null;
    title: string;
    rows: T[];
}

interface GroupByCourseOptions<T> {
    /** Course id for a row, or `null`/`undefined` when it has no course. */
    getCourseId: (row: T) => string | null | undefined;
    /** Human title for a course id. Return `null` to fall back to the id. */
    getCourseTitle: (courseId: string) => string | null | undefined;
    /** Optional per-group row sort (applied within each course). */
    sortRows?: (a: T, b: T) => number;
    /** Label for the trailing bucket of course-less rows. */
    unassignedLabel?: string;
}

/**
 * Bucket `rows` by course, named courses first (alphabetical by title), the
 * unassigned bucket always last. Stable for a stable input order.
 */
export function groupByCourse<T>(
    rows: T[],
    {
        getCourseId,
        getCourseTitle,
        sortRows,
        unassignedLabel = 'Unassigned',
    }: GroupByCourseOptions<T>,
): CourseGroup<T>[] {
    const byCourse = new Map<string, CourseGroup<T>>();
    const unassigned: CourseGroup<T> = { courseId: null, title: unassignedLabel, rows: [] };

    for (const row of rows) {
        const id = getCourseId(row);
        if (!id) {
            unassigned.rows.push(row);
            continue;
        }
        if (!byCourse.has(id)) {
            byCourse.set(id, { courseId: id, title: getCourseTitle(id) || id, rows: [] });
        }
        byCourse.get(id)!.rows.push(row);
    }

    const named = Array.from(byCourse.values());
    if (sortRows) {
        for (const group of named) group.rows.sort(sortRows);
        unassigned.rows.sort(sortRows);
    }
    named.sort((a, b) => a.title.localeCompare(b.title));

    return unassigned.rows.length > 0 ? [...named, unassigned] : named;
}

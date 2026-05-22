// Assigns a stable, date-ranked sequence number to each run of a blueprint,
// grouped per course. So when several scheduled sessions share the same name,
// the picker can label them "Session 1, 2, 3…" by chronological order —
// independent of whatever display sort is active.

interface NumberableRun {
    run_id: string;
    starts_at: string | null;
    ends_at: string | null;
    course_title?: string | null;
    course_id?: string | null;
    kind?: string;
}

function runTimestamp(run: NumberableRun): number {
    if (run.starts_at) return Date.parse(run.starts_at);
    if (run.ends_at) return Date.parse(run.ends_at);
    return 0;
}

/** Map of run_id → 1-based session number, ranked by date within each course.
 *  "COMBINED" pseudo-runs are skipped (they aren't a single occurrence). */
export function numberRunsByCourse<T extends NumberableRun>(runs: T[]): Map<string, number> {
    const groups = new Map<string, T[]>();
    for (const run of runs) {
        if (run.kind === 'COMBINED') continue;
        const key = run.course_id ?? run.course_title ?? '';
        const bucket = groups.get(key);
        if (bucket) bucket.push(run);
        else groups.set(key, [run]);
    }

    const numbers = new Map<string, number>();
    for (const bucket of groups.values()) {
        [...bucket]
            .sort((a, b) => runTimestamp(a) - runTimestamp(b))
            .forEach((run, index) => numbers.set(run.run_id, index + 1));
    }
    return numbers;
}

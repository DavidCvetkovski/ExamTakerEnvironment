'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { api } from '@/lib/api';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import PageShell from '@/components/layout/PageShell';
import { pluralizeCount } from '@/lib/pluralize';
import { formatRelativeTime } from '@/lib/relativeTime';

interface AnalyticsIndexRow {
    test_definition_id: string;
    title: string;
    description: string | null;
    blocks_count: number;
    duration_minutes: number;
    pass_percentage: number;
    /** Count of scheduled runs that have closed (the user-facing "session"). */
    completed_sessions: number;
    /** Count of scheduled runs still in the future. */
    scheduled_upcoming: number;
    /** Count of student submissions (one per attempt). */
    submissions_total: number;
    /** Subset of submissions with a published result. */
    published_results: number;
    pending_grading: number;
    /** Most-recent CLOSED scheduled run's ends_at. */
    latest_completed_run_at: string | null;
    /** Most-recent individual student submission. */
    latest_submission_at: string | null;
    primary_course_code: string | null;
    primary_course_title: string | null;
}

interface CourseGroup {
    code: string | null;
    title: string;
    rows: AnalyticsIndexRow[];
}

// Sorting options for the index. A "completed session" in our UI vocab is
// a scheduled exam run that has closed (CLAUDE.md §7.9 lifecycle:
// SCHEDULED → ONGOING → COMPLETED). It is NOT a single student submission;
// student attempts are "submissions" / "results".
type SortKey = 'last_completed' | 'most_completed' | 'most_submissions' | 'most_pending' | 'title';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'last_completed',   label: 'Last completed session' },
    { key: 'most_completed',   label: 'Most completed sessions' },
    { key: 'most_submissions', label: 'Most submissions' },
    { key: 'most_pending',     label: 'Most pending grading' },
    { key: 'title',            label: 'Blueprint title (A–Z)' },
];

function tsOf(iso: string | null): number {
    return iso ? Date.parse(iso) : 0;
}

function rowComparator(sort: SortKey): (a: AnalyticsIndexRow, b: AnalyticsIndexRow) => number {
    switch (sort) {
        case 'most_completed':
            return (a, b) => b.completed_sessions - a.completed_sessions
                || tsOf(b.latest_completed_run_at) - tsOf(a.latest_completed_run_at);
        case 'most_submissions':
            return (a, b) => b.submissions_total - a.submissions_total
                || tsOf(b.latest_submission_at) - tsOf(a.latest_submission_at);
        case 'most_pending':
            return (a, b) => b.pending_grading - a.pending_grading
                || b.submissions_total - a.submissions_total;
        case 'title':
            return (a, b) => a.title.localeCompare(b.title);
        case 'last_completed':
        default:
            return (a, b) => tsOf(b.latest_completed_run_at) - tsOf(a.latest_completed_run_at);
    }
}

// Per-sort group ranking — what makes one course "ahead of" another depends
// on the active sort key. For "last completed", a course with the most-recent
// completed run wins; for "most pending", the largest backlog wins.
function groupRank(group: CourseGroup, sort: SortKey): number {
    switch (sort) {
        case 'most_completed':
            return -group.rows.reduce((m, r) => Math.max(m, r.completed_sessions), 0);
        case 'most_submissions':
            return -group.rows.reduce((m, r) => Math.max(m, r.submissions_total), 0);
        case 'most_pending':
            return -group.rows.reduce((s, r) => s + r.pending_grading, 0);
        case 'title':
            return 0; // alphabetical course order handled separately
        case 'last_completed':
        default:
            return -group.rows.reduce(
                (m, r) => Math.max(m, tsOf(r.latest_completed_run_at)),
                0,
            );
    }
}

// Stable bucketing — rows with data first, grouped by course; rows without
// data collapsed to a single "No submissions yet" group at the bottom.
function groupByCourse(rows: AnalyticsIndexRow[], sort: SortKey): {
    withData: CourseGroup[];
    empty: AnalyticsIndexRow[];
} {
    // A blueprint counts as "active" once it has at least one completed
    // scheduled session or at least one student submission (practice runs
    // count via the latter). The rest go to the collapsed empty bucket.
    const withData = rows.filter((r) => r.completed_sessions > 0 || r.submissions_total > 0);
    const empty = rows.filter((r) => r.completed_sessions === 0 && r.submissions_total === 0);

    const byCourse = new Map<string, CourseGroup>();
    for (const row of withData) {
        const code = row.primary_course_code ?? '__practice__';
        const title = row.primary_course_title
            ?? (row.primary_course_code ? row.primary_course_code : 'Practice & other');
        if (!byCourse.has(code)) {
            byCourse.set(code, { code: row.primary_course_code, title, rows: [] });
        }
        byCourse.get(code)!.rows.push(row);
    }

    const comparator = rowComparator(sort);
    for (const group of byCourse.values()) {
        group.rows.sort(comparator);
    }

    const groups = Array.from(byCourse.values()).sort((a, b) => {
        if (sort === 'title') return a.title.localeCompare(b.title);
        return groupRank(a, sort) - groupRank(b, sort);
    });

    // Empty bucket: alphabetical by title regardless of sort key — there's
    // no completion signal to rank on, so any "most X" order is meaningless.
    empty.sort((a, b) => a.title.localeCompare(b.title));

    return { withData: groups, empty };
}

export default function AnalyticsIndexPage() {
    const router = useRouter();
    const [rows, setRows] = useState<AnalyticsIndexRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showEmpty, setShowEmpty] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>('last_completed');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await api.get<AnalyticsIndexRow[]>('/analytics/index');
                if (!cancelled) setRows(response.data);
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load analytics index.');
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const { withData, empty } = useMemo(() => groupByCourse(rows, sortKey), [rows, sortKey]);

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <PageShell width="wide">
                <PageHeader
                    title="Analytics"
                    subtitle="Blueprints grouped by course. A completed session is one scheduled run that has closed; submissions are the individual student attempts inside those runs."
                />

                {rows.length > 0 && (
                    <div className="mb-4 flex items-center gap-3">
                        <label htmlFor="analytics-sort" className="text-meta text-shell-muted-dim">
                            Sort by
                        </label>
                        <select
                            id="analytics-sort"
                            value={sortKey}
                            onChange={(e) => setSortKey(e.target.value as SortKey)}
                            className="rounded-xl border border-shell-border bg-shell-input px-3 py-1.5 text-meta text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
                        >
                            {SORT_OPTIONS.map((opt) => (
                                <option key={opt.key} value={opt.key}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {isLoading && rows.length === 0 ? (
                    <div className="flex items-center justify-center py-24 text-shell-muted-dim text-meta gap-3">
                        <Spinner size="sm" /> Loading analytics index…
                    </div>
                ) : error ? (
                    <div className="rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] px-4 py-3 text-meta">
                        {error}
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState
                        title="No test blueprints yet"
                        description="Create and publish a test before analytics can tell us anything useful."
                    />
                ) : (
                    <div className="space-y-8">
                        {withData.length === 0 ? (
                            <EmptyState
                                title="No completed sessions yet"
                                description="Once a scheduled run closes (or a practice attempt is submitted), the blueprint will appear here grouped by course."
                            />
                        ) : (
                            withData.map((group) => (
                                <section key={group.code ?? '__practice__'} className="space-y-3">
                                    <div className="flex items-baseline justify-between gap-3 border-b border-shell-border pb-2">
                                        <h2 className="text-h3 font-semibold text-foreground">
                                            {group.title}
                                            {group.code && (
                                                <span className="ml-2 text-meta text-shell-muted-dim font-normal">
                                                    {group.code}
                                                </span>
                                            )}
                                        </h2>
                                        <span className="text-meta text-shell-muted-dim">
                                            {pluralizeCount(group.rows.length, 'blueprint')}
                                        </span>
                                    </div>
                                    <div className="grid gap-4 lg:grid-cols-2">
                                        {group.rows.map((row) => (
                                            <BlueprintCard
                                                key={row.test_definition_id}
                                                row={row}
                                                onOpen={() =>
                                                    router.push(`/analytics/tests/${row.test_definition_id}`)
                                                }
                                            />
                                        ))}
                                    </div>
                                </section>
                            ))
                        )}

                        {empty.length > 0 && (
                            <section className="space-y-3">
                                <div className="flex items-baseline justify-between gap-3 border-b border-shell-border pb-2">
                                    <h2 className="text-h3 font-semibold text-shell-muted">
                                        No completed sessions yet
                                        <span className="ml-2 text-meta text-shell-muted-dim font-normal">
                                            {pluralizeCount(empty.length, 'blueprint')}
                                        </span>
                                    </h2>
                                    <button
                                        type="button"
                                        className="text-meta text-brand hover:underline"
                                        onClick={() => setShowEmpty((v) => !v)}
                                    >
                                        {showEmpty ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                                {showEmpty && (
                                    <div className="grid gap-4 lg:grid-cols-2">
                                        {empty.map((row) => (
                                            <BlueprintCard
                                                key={row.test_definition_id}
                                                row={row}
                                                onOpen={() =>
                                                    router.push(`/analytics/tests/${row.test_definition_id}`)
                                                }
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}
                    </div>
                )}
            </PageShell>
        </ProtectedRoute>
    );
}

function BlueprintCard({
    row,
    onOpen,
}: {
    row: AnalyticsIndexRow;
    onOpen: () => void;
}) {
    const hasActivity = row.submissions_total > 0 || row.completed_sessions > 0;
    return (
        <Card variant="surface" padding="md" interactive>
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-h3 font-semibold text-foreground">{row.title}</p>
                    <p className="mt-1 text-meta text-shell-muted-dim line-clamp-2">
                        {row.description || 'No description provided.'}
                    </p>
                </div>
                <Button variant="primary" size="sm" onClick={onOpen}>
                    Open →
                </Button>
            </div>

            {/*
              * Two unified rows. Row 1: activity stats (varies per blueprint).
              * Row 2: blueprint shape (constant: sections · duration · pass).
              * The "last completed" timestamp goes in a thin caption under
              * row 1 so it doesn't break the badge rhythm.
              */}
            <div className="mt-4 space-y-2">
                {hasActivity ? (
                    <>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {row.completed_sessions > 0 && (
                                <Badge tone="success" size="sm">
                                    {pluralizeCount(row.completed_sessions, 'completed session')}
                                </Badge>
                            )}
                            {row.scheduled_upcoming > 0 && (
                                <Badge tone="info" size="sm">
                                    {pluralizeCount(row.scheduled_upcoming, 'scheduled session')}
                                </Badge>
                            )}
                            {row.submissions_total > 0 && (
                                <Badge tone="neutral" size="sm">
                                    {pluralizeCount(row.submissions_total, 'submission')}
                                </Badge>
                            )}
                            {row.pending_grading > 0 && (
                                <Badge tone="warning" size="sm">
                                    {pluralizeCount(row.pending_grading, 'pending grade')}
                                </Badge>
                            )}
                        </div>
                        {row.latest_completed_run_at && (
                            <p className="text-meta text-shell-muted-dim">
                                Last completed {formatRelativeTime(row.latest_completed_run_at)}
                            </p>
                        )}
                    </>
                ) : (
                    <Badge tone="neutral" size="sm">No completed sessions yet</Badge>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-shell-muted-dim pt-1 border-t border-shell-border/60">
                    <span>{pluralizeCount(row.blocks_count, 'section')}</span>
                    <span aria-hidden="true">·</span>
                    <span>{row.duration_minutes} min</span>
                    <span aria-hidden="true">·</span>
                    <span>Pass {row.pass_percentage}%</span>
                </div>
            </div>
        </Card>
    );
}

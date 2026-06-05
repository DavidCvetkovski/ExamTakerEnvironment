'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { api } from '@/lib/api';
import { Badge, Button, Card, EmptyState, PageHeader, RefreshIcon, Spinner } from '@/components/ui';
import PageShell from '@/components/layout/PageShell';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { pluralizeCount } from '@/lib/pluralize';
import { formatRelativeTime } from '@/lib/relativeTime';

// Mirrors the /analytics/index payload. Same backend endpoint feeds both
// pages — the data they need (per-blueprint counts grouped by course) is
// identical, only the card target and default sort differ.
interface GradingIndexRow {
    test_definition_id: string;
    title: string;
    description: string | null;
    blocks_count: number;
    duration_minutes: number;
    pass_percentage: number;
    completed_sessions: number;
    scheduled_upcoming: number;
    submissions_total: number;
    published_results: number;
    pending_grading: number;
    latest_completed_run_at: string | null;
    latest_submission_at: string | null;
    primary_course_code: string | null;
    primary_course_title: string | null;
}

interface CourseGroup {
    code: string | null;
    title: string;
    rows: GradingIndexRow[];
}

// Default sort differs from analytics: graders care first about the largest
// backlog. Same option set otherwise so muscle memory transfers between tabs.
type SortKey = 'most_pending' | 'last_completed' | 'most_submissions' | 'most_completed' | 'title';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'most_pending',     label: 'Most pending grading' },
    { key: 'last_completed',   label: 'Last completed session' },
    { key: 'most_submissions', label: 'Most submissions' },
    { key: 'most_completed',   label: 'Most completed sessions' },
    { key: 'title',            label: 'Blueprint title (A–Z)' },
];

function tsOf(iso: string | null): number {
    return iso ? Date.parse(iso) : 0;
}

function rowComparator(sort: SortKey): (a: GradingIndexRow, b: GradingIndexRow) => number {
    switch (sort) {
        case 'last_completed':
            return (a, b) => tsOf(b.latest_completed_run_at) - tsOf(a.latest_completed_run_at);
        case 'most_completed':
            return (a, b) => b.completed_sessions - a.completed_sessions
                || tsOf(b.latest_completed_run_at) - tsOf(a.latest_completed_run_at);
        case 'most_submissions':
            return (a, b) => b.submissions_total - a.submissions_total
                || tsOf(b.latest_submission_at) - tsOf(a.latest_submission_at);
        case 'title':
            return (a, b) => a.title.localeCompare(b.title);
        case 'most_pending':
        default:
            return (a, b) => b.pending_grading - a.pending_grading
                || b.submissions_total - a.submissions_total;
    }
}

function groupRank(group: CourseGroup, sort: SortKey): number {
    switch (sort) {
        case 'last_completed':
            return -group.rows.reduce(
                (m, r) => Math.max(m, tsOf(r.latest_completed_run_at)),
                0,
            );
        case 'most_completed':
            return -group.rows.reduce((m, r) => Math.max(m, r.completed_sessions), 0);
        case 'most_submissions':
            return -group.rows.reduce((m, r) => Math.max(m, r.submissions_total), 0);
        case 'title':
            return 0;
        case 'most_pending':
        default:
            return -group.rows.reduce((s, r) => s + r.pending_grading, 0);
    }
}

function groupByCourse(rows: GradingIndexRow[], sort: SortKey): {
    withData: CourseGroup[];
    empty: GradingIndexRow[];
} {
    // For grading we care about anything that has any student attempt at
    // all — even a single submission may be sitting in the queue.
    const withData = rows.filter((r) => r.submissions_total > 0 || r.completed_sessions > 0);
    const empty = rows.filter((r) => r.submissions_total === 0 && r.completed_sessions === 0);

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

    empty.sort((a, b) => a.title.localeCompare(b.title));

    return { withData: groups, empty };
}

export default function GradingLandingPage() {
    const router = useRouter();
    const [rows, setRows] = useState<GradingIndexRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showEmpty, setShowEmpty] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>('most_pending');
    // State is set only inside the async callbacks (never synchronously) so this
    // is safe to call from the mount effect; the manual refresh flips the
    // loading/error state itself in its event handler below.
    const fetchRows = useCallback(() => {
        api.get<GradingIndexRow[]>('/analytics/index')
            .then((r) => { setRows(r.data); })
            .catch((err) => { setError(err instanceof Error ? err.message : 'Failed to load grading index.'); })
            .finally(() => { setIsLoading(false); });
    }, []);

    useEffect(() => {
        // ProtectedRoute already restricts this page to staff; no inline role
        // redirect needed. Single fetch path via fetchRows (no duplicated call).
        fetchRows();
    }, [fetchRows]);

    const { withData, empty } = useMemo(() => groupByCourse(rows, sortKey), [rows, sortKey]);

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <PageShell width="wide">
                <PageHeader
                    title="Grading"
                    subtitle="Blueprints grouped by course. Open one to review its completed sessions, score submissions, and clear the manual-grading queue."
                />

                {rows.length > 0 && (
                    <div className="mb-4 flex items-center gap-3">
                        {/* L-17: manual refresh so pending counts stay current as students submit. */}
                        <button
                            type="button"
                            onClick={() => { setIsLoading(true); setError(null); fetchRows(); }}
                            disabled={isLoading}
                            className="inline-flex items-center gap-1.5 text-meta text-shell-muted hover:text-foreground transition-colors disabled:opacity-40"
                            title="Refresh grading queue"
                        >
                            <RefreshIcon size={16} className={isLoading ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                        <label htmlFor="grading-sort" className="ml-auto text-meta text-shell-muted-dim">
                            Sort by
                        </label>
                        <select
                            id="grading-sort"
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
                    <div className="flex items-center justify-center py-24 gap-3 text-shell-muted-dim text-meta">
                        <Spinner size="sm" /> Loading grading index…
                    </div>
                ) : error ? (
                    <div className="rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] px-4 py-3 text-meta">
                        {error}
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState
                        title="No test blueprints yet"
                        description="Once a blueprint exists, completed sessions will queue here for grading."
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
                                                    router.push(`/grading/test/${row.test_definition_id}`)
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
                                                    router.push(`/grading/test/${row.test_definition_id}`)
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
    row: GradingIndexRow;
    onOpen: () => void;
}) {
    const hasActivity = row.submissions_total > 0 || row.completed_sessions > 0;
    const allGraded = hasActivity && row.pending_grading === 0 && row.submissions_total > 0;
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

            <div className="mt-4 space-y-2">
                {hasActivity ? (
                    <>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {row.pending_grading > 0 && (
                                <Badge tone="warning" size="sm">
                                    {pluralizeCount(row.pending_grading, 'pending grade')}
                                </Badge>
                            )}
                            {allGraded && (
                                <Badge tone="success" size="sm">All graded</Badge>
                            )}
                            {row.completed_sessions > 0 && (
                                <Badge tone="neutral" size="sm">
                                    {pluralizeCount(row.completed_sessions, 'completed session')}
                                </Badge>
                            )}
                            {row.submissions_total > 0 && (
                                <Badge tone="neutral" size="sm">
                                    {pluralizeCount(row.submissions_total, 'submission')}
                                </Badge>
                            )}
                            {row.scheduled_upcoming > 0 && (
                                <Badge tone="info" size="sm">
                                    {pluralizeCount(row.scheduled_upcoming, 'scheduled session')}
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

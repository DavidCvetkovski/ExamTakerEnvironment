'use client';

/**
 * Analytics runs picker — Epoch 8.6 Stage 2.
 *
 * Mirrors the grading picker (one card per scheduled-session run) and pins
 * a "Combined" card on top as the recommended default. Splitting
 * psychometrics by run halves the sample per cohort and tanks reliability
 * metrics — the combined card preserves the all-runs aggregate as the
 * right default, with per-run drill-in available for explicit cohort
 * comparisons. Practice-mode submissions are excluded server-side and do
 * not appear here.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import {
    BackButton,
    Badge,
    Button,
    Card,
    EmptyState,
    PageHeader,
    Spinner,
} from '@/components/ui';
import PageShell from '@/components/layout/PageShell';
import { useAnalyticsStore } from '@/stores/useAnalyticsStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { formatAbsolute, formatScheduled } from '@/lib/relativeTime';
import { pluralizeCount } from '@/lib/pluralize';
import type { AnalyticsRun } from '@/lib/analytics';

// Sort controls for the "Individual sessions" picker. "Most recent" is the
// default because the typical drill-in is "what did the last cohort look like
// for this exam?".
type SortKey = 'most_recent' | 'oldest' | 'most_submissions' | 'course' | 'status';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'most_recent',      label: 'Most recently completed' },
    { key: 'oldest',           label: 'Oldest first' },
    { key: 'most_submissions', label: 'Most submissions' },
    { key: 'course',           label: 'Alphabetical (A–Z)' },
    { key: 'status',           label: 'Lifecycle status' },
];

// Status order matches the picker's usefulness: Completed first (you can
// actually drill in), then Canceled (residual data), then Ongoing, then
// Scheduled (no data yet).
const STATUS_ORDER: Record<AnalyticsRun['lifecycle_status'], number> = {
    CLOSED:    0,
    CANCELED:  1,
    ACTIVE:    2,
    SCHEDULED: 3,
};

function endsAtTs(r: AnalyticsRun): number {
    return r.ends_at ? Date.parse(r.ends_at) : 0;
}

function sortRuns(runs: AnalyticsRun[], sort: SortKey): AnalyticsRun[] {
    const copy = [...runs];
    switch (sort) {
        case 'oldest':
            return copy.sort((a, b) => {
                const at = endsAtTs(a) || Number.POSITIVE_INFINITY;
                const bt = endsAtTs(b) || Number.POSITIVE_INFINITY;
                return at - bt;
            });
        case 'most_submissions':
            return copy.sort((a, b) => b.submissions_total - a.submissions_total
                || endsAtTs(b) - endsAtTs(a));
        case 'course':
            return copy.sort((a, b) => {
                const at = a.course_title ?? '';
                const bt = b.course_title ?? '';
                return at.localeCompare(bt) || endsAtTs(b) - endsAtTs(a);
            });
        case 'status':
            return copy.sort((a, b) =>
                STATUS_ORDER[a.lifecycle_status] - STATUS_ORDER[b.lifecycle_status]
                || endsAtTs(b) - endsAtTs(a),
            );
        case 'most_recent':
        default:
            return copy.sort((a, b) => endsAtTs(b) - endsAtTs(a));
    }
}

const LIFECYCLE_LABEL: Record<AnalyticsRun['lifecycle_status'], string> = {
    SCHEDULED: 'Scheduled',
    ACTIVE: 'Ongoing',
    CLOSED: 'Completed',
    CANCELED: 'Canceled',
};
const LIFECYCLE_TONE: Record<
    AnalyticsRun['lifecycle_status'],
    'info' | 'success' | 'neutral' | 'warning'
> = {
    SCHEDULED: 'info',
    ACTIVE: 'warning',
    CLOSED: 'success',
    CANCELED: 'neutral',
};

export default function AnalyticsRunsPickerPage() {
    const router = useRouter();
    const { testId } = useParams<{ testId: string }>();
    const { blueprints, fetchBlueprints } = useBlueprintStore();
    const { runsByTestId, loadAnalyticsRuns, status, error, clearError } =
        useAnalyticsStore();

    useEffect(() => { fetchBlueprints(); }, [fetchBlueprints]);
    useEffect(() => {
        if (testId) void loadAnalyticsRuns(testId);
    }, [testId, loadAnalyticsRuns]);

    const blueprint = useMemo(
        () => blueprints.find((b) => b.id === testId) ?? null,
        [blueprints, testId],
    );
    const runs: AnalyticsRun[] = (testId && runsByTestId[testId]) || [];
    const combined = runs.find((r) => r.kind === 'COMBINED') ?? null;
    const [sortKey, setSortKey] = useState<SortKey>('most_recent');
    // "Individual sessions" = scheduled runs only.
    const otherRuns = useMemo(
        () => sortRuns(runs.filter((r) => r.kind === 'ASSIGNED'), sortKey),
        [runs, sortKey],
    );
    const isLoading = !runsByTestId[testId!] && status === 'loading';

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <PageShell width="wide">
                <BackButton href="/analytics" label="All blueprints" />

                <PageHeader
                    title={blueprint?.title ?? 'Choose a cohort'}
                    subtitle="The combined view pools every published submission across all completed sessions (recommended for reliability). Open an individual session to inspect that cohort on its own."
                />

                {error && (
                    <div className="mb-6 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] px-4 py-3 flex justify-between items-start text-meta">
                        <span>{error}</span>
                        <button
                            onClick={clearError}
                            aria-label="Dismiss"
                            className="ml-4 opacity-70 hover:opacity-100"
                        >
                            ×
                        </button>
                    </div>
                )}

                {isLoading ? (
                    <div className="flex items-center justify-center py-24 gap-3 text-shell-muted-dim text-meta">
                        <Spinner size="sm" /> Loading runs…
                    </div>
                ) : runs.length === 0 ? (
                    <EmptyState
                        title="No analytics data yet"
                        description="Publish graded results for at least one run of this blueprint before analytics can tell us anything useful."
                    />
                ) : (
                    <div className="space-y-6">
                        {combined && (
                            <CombinedCard
                                testId={testId!}
                                run={combined}
                                router={router}
                            />
                        )}
                        {otherRuns.length > 0 && (
                            <div>
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <h2 className="text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim">
                                        Individual sessions
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        <label
                                            htmlFor="analytics-runs-sort"
                                            className="text-meta text-shell-muted-dim"
                                        >
                                            Sort by
                                        </label>
                                        <select
                                            id="analytics-runs-sort"
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
                                </div>
                                <div className="flex flex-col gap-3">
                                    {otherRuns.map((run) => (
                                        <RunCard
                                            key={run.run_id}
                                            testId={testId!}
                                            run={run}
                                            router={router}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </PageShell>
        </ProtectedRoute>
    );
}

function CombinedCard({
    testId,
    run,
    router,
}: {
    testId: string;
    run: AnalyticsRun;
    router: ReturnType<typeof useRouter>;
}) {
    return (
        <Card variant="surface" padding="md" interactive className="border-2 border-brand/40">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="text-h3 font-semibold text-foreground">Combined</p>
                        <Badge tone="accent" size="sm">Recommended</Badge>
                    </div>
                    <p className="mt-1 text-meta text-shell-muted-dim">
                        Pools all published submissions across every completed
                        session of this blueprint. Best statistical power for
                        reliability metrics.
                    </p>
                </div>
                <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                        router.push(`/analytics/tests/${testId}/run/combined`)
                    }
                >
                    Open →
                </Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
                <Badge tone="neutral" size="sm">
                    {pluralizeCount(run.submissions_total, 'submission')}
                </Badge>
            </div>
        </Card>
    );
}

function RunCard({
    testId,
    run,
    router,
}: {
    testId: string;
    run: AnalyticsRun;
    router: ReturnType<typeof useRouter>;
}) {
    const hasData = run.submissions_total > 0;
    const lifecycleLabel = LIFECYCLE_LABEL[run.lifecycle_status];
    const lifecycleTone = LIFECYCLE_TONE[run.lifecycle_status];

    const windowLabel = run.ends_at
        ? new Date(run.ends_at) > new Date()
            ? `Closes ${formatScheduled(run.ends_at)}`
            : `Closed ${formatScheduled(run.ends_at)}`
        : 'No window';

    return (
        <Card variant="surface" padding="md" interactive={hasData}>
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-h3 font-semibold text-foreground" title={run.course_code ?? undefined}>
                        {run.course_title ?? 'Scheduled run'}
                    </p>
                    <p
                        className="mt-1 text-meta text-shell-muted-dim"
                        title={run.ends_at ? formatAbsolute(run.ends_at) : undefined}
                    >
                        {windowLabel}
                    </p>
                </div>
                {hasData ? (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                            router.push(`/analytics/tests/${testId}/run/${run.run_id}`)
                        }
                    >
                        Open →
                    </Button>
                ) : (
                    <Button variant="ghost" size="sm" disabled title="No published submissions yet">
                        No data yet
                    </Button>
                )}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
                <Badge tone={lifecycleTone} size="sm">{lifecycleLabel}</Badge>
                <Badge tone="neutral" size="sm">
                    {pluralizeCount(run.submissions_total, 'submission')}
                </Badge>
            </div>
        </Card>
    );
}

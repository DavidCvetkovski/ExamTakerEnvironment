'use client';

/**
 * Grading runs picker — Epoch 8.6 Stage 2.
 *
 * Inserts the missing middle layer between the blueprint cards on
 * /grading and the per-blueprint dashboard. Lists every scheduled-session
 * run of this blueprint, gates the "Grade →" action to runs whose window
 * has closed, and renders disabled-but-visible cards for ongoing /
 * upcoming runs so the constructor still sees situational awareness.
 * Practice-mode submissions are excluded server-side and do not appear here.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

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
import { useAuthStore } from '@/stores/useAuthStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useGradingStore, type GradingRun } from '@/stores/useGradingStore';
import { formatAbsolute, formatScheduled } from '@/lib/relativeTime';
import { pluralizeCount } from '@/lib/pluralize';
import { numberRunsByCourse } from '@/lib/runOrdinal';

// Sort controls for the per-blueprint runs picker. Same option set as the
// analytics picker (so muscle memory transfers between tabs) plus
// "Most pending grading" which is the default — graders care first about
// the largest queue, not the most recent cohort.
type SortKey =
    | 'most_pending'
    | 'most_recent'
    | 'oldest'
    | 'most_submissions'
    | 'course'
    | 'status';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'most_pending',     label: 'Most pending grading' },
    { key: 'most_recent',      label: 'Most recently completed' },
    { key: 'oldest',           label: 'Oldest first' },
    { key: 'most_submissions', label: 'Most submissions' },
    { key: 'course',           label: 'Alphabetical (A–Z)' },
    { key: 'status',           label: 'Lifecycle status' },
];

// Status order matches the picker's usefulness: Completed first (gradable),
// then Canceled (residual data), then Ongoing, then Scheduled (no data yet).
const STATUS_ORDER: Record<GradingRun['lifecycle_status'], number> = {
    CLOSED:    0,
    CANCELED:  1,
    ACTIVE:    2,
    SCHEDULED: 3,
};

function endsAtTs(r: GradingRun): number {
    return r.ends_at ? Date.parse(r.ends_at) : 0;
}

function sortRuns(runs: GradingRun[], sort: SortKey): GradingRun[] {
    const copy = [...runs];
    switch (sort) {
        case 'most_recent':
            return copy.sort((a, b) => endsAtTs(b) - endsAtTs(a));
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
        case 'most_pending':
        default:
            return copy.sort((a, b) => b.ungraded_response_count - a.ungraded_response_count
                || endsAtTs(b) - endsAtTs(a));
    }
}

/** UI label per lifecycle status — matches CLAUDE.md §7.9 canon vocabulary. */
const LIFECYCLE_LABEL: Record<GradingRun['lifecycle_status'], string> = {
    SCHEDULED: 'Scheduled',
    ACTIVE: 'Ongoing',
    CLOSED: 'Completed',
    CANCELED: 'Canceled',
};

const LIFECYCLE_TONE: Record<
    GradingRun['lifecycle_status'],
    'info' | 'success' | 'neutral' | 'warning'
> = {
    SCHEDULED: 'info',
    ACTIVE: 'warning',
    CLOSED: 'success',
    CANCELED: 'neutral',
};

export default function GradingRunsPickerPage() {
    const router = useRouter();
    const { testId } = useParams<{ testId: string }>();
    const { user } = useAuthStore();
    const { blueprints, fetchBlueprints } = useBlueprintStore();
    const {
        runsByTestId, runsLoading, error,
        fetchGradingRuns, clearError,
    } = useGradingStore();

    useEffect(() => {
        if (user?.role === 'STUDENT') {
            router.replace('/my-exams');
            return;
        }
        fetchBlueprints();
    }, [user, router, fetchBlueprints]);

    useEffect(() => {
        if (testId) void fetchGradingRuns(testId);
    }, [testId, fetchGradingRuns]);

    const blueprint = useMemo(
        () => blueprints.find((b) => b.id === testId) ?? null,
        [blueprints, testId],
    );
    const rawRuns: GradingRun[] = useMemo(
        () => (testId && runsByTestId[testId]) || [],
        [testId, runsByTestId],
    );
    const [sortKey, setSortKey] = useState<SortKey>('most_pending');
    const runNumbers = useMemo(() => numberRunsByCourse(rawRuns), [rawRuns]);
    const scheduledRuns = useMemo(
        () => sortRuns(rawRuns, sortKey),
        [rawRuns, sortKey],
    );
    const hasAnyRun = scheduledRuns.length > 0;

    return (
        <PageShell width="wide">
            <BackButton href="/grading" label="All blueprints" />

            <PageHeader
                title={blueprint?.title ?? 'Choose a run'}
                subtitle="Each row is one scheduled occurrence of this blueprint. Open a completed run to grade its submissions."
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

            {runsLoading && !hasAnyRun ? (
                <div className="flex items-center justify-center py-24 gap-3 text-shell-muted-dim text-meta">
                    <Spinner size="sm" /> Loading runs…
                </div>
            ) : !hasAnyRun ? (
                <EmptyState
                    title="No runs to grade yet"
                    description="Schedule this blueprint and let a session close before students' work appears here."
                />
            ) : (
                <div className="space-y-6">
                    {scheduledRuns.length > 0 && (
                        <div>
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <h2 className="text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim">
                                    Individual sessions
                                </h2>
                                <div className="flex items-center gap-2">
                                    <label
                                        htmlFor="grading-runs-sort"
                                        className="text-meta text-shell-muted-dim"
                                    >
                                        Sort by
                                    </label>
                                    <select
                                        id="grading-runs-sort"
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
                                {scheduledRuns.map((run) => (
                                    <RunCard key={run.run_id} testId={testId!} run={run} router={router} seq={runNumbers.get(run.run_id)} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </PageShell>
    );
}

function RunCard({
    testId,
    run,
    router,
    seq,
}: {
    seq?: number;
    testId: string;
    run: GradingRun;
    router: ReturnType<typeof useRouter>;
}) {
    const lifecycleLabel = LIFECYCLE_LABEL[run.lifecycle_status];
    const lifecycleTone = LIFECYCLE_TONE[run.lifecycle_status];

    const hasPending = run.ungraded_response_count > 0;
    const windowLabel = run.ends_at
        ? new Date(run.ends_at) > new Date()
            ? `Closes ${formatScheduled(run.ends_at)}`
            : `Closed ${formatScheduled(run.ends_at)}`
        : 'No window';

    return (
        <Card variant="surface" padding="md" interactive={run.is_gradable}>
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-h3 font-semibold text-foreground" title={run.course_code ?? undefined}>
                        {seq != null && (
                            <span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-shell-input px-1.5 text-meta font-semibold text-shell-muted">
                                {seq}
                            </span>
                        )}
                        {run.course_title ?? 'Scheduled run'}
                    </p>
                    <p
                        className="mt-1 text-meta text-shell-muted-dim"
                        title={run.ends_at ? formatAbsolute(run.ends_at) : undefined}
                    >
                        {windowLabel}
                    </p>
                </div>
                {run.is_gradable ? (
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() =>
                            router.push(`/grading/test/${testId}/run/${run.run_id}`)
                        }
                    >
                        Grade →
                    </Button>
                ) : run.lifecycle_status === 'CLOSED' ? (
                    // Completed run with nothing to grade — not a temporary lock.
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled
                        title="No students submitted this run, so there is nothing to grade."
                    >
                        Nothing to grade
                    </Button>
                ) : (
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled
                        title={
                            run.ends_at && new Date(run.ends_at) > new Date()
                                ? `Available after ${formatScheduled(run.ends_at)}`
                                : 'Available once this run has closed'
                        }
                    >
                        Locked
                    </Button>
                )}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
                <Badge tone={lifecycleTone} size="sm">{lifecycleLabel}</Badge>
                <Badge tone="neutral" size="sm">
                    {pluralizeCount(run.submissions_total, 'submission')}
                </Badge>
                {hasPending ? (
                    <Badge tone="warning" size="sm">
                        {pluralizeCount(run.ungraded_response_count, 'ungraded response')}
                    </Badge>
                ) : run.submissions_total > 0 ? (
                    <Badge tone="success" size="sm">All graded</Badge>
                ) : (
                    <Badge tone="neutral" size="sm">No submissions</Badge>
                )}
            </div>
        </Card>
    );
}

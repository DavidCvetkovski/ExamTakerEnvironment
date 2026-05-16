'use client';

/**
 * Grading runs picker — Epoch 8.6 Stage 2.
 *
 * Inserts the missing middle layer between the blueprint cards on
 * /grading and the per-blueprint dashboard. Lists every scheduled-session
 * run of this blueprint plus a Practice bucket (when present), gates the
 * "Grade →" action to runs whose window has closed, and renders disabled-
 * but-visible cards for ongoing / upcoming runs so the constructor still
 * sees situational awareness.
 */

import { useEffect, useMemo } from 'react';
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
    const runs: GradingRun[] = (testId && runsByTestId[testId]) || [];

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

            {runsLoading && runs.length === 0 ? (
                <div className="flex items-center justify-center py-24 gap-3 text-shell-muted-dim text-meta">
                    <Spinner size="sm" /> Loading runs…
                </div>
            ) : runs.length === 0 ? (
                <EmptyState
                    title="No runs to grade yet"
                    description="Schedule this blueprint and let a session close before students' work appears here."
                />
            ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                    {runs.map((run) => (
                        <RunCard key={run.run_id} testId={testId!} run={run} router={router} />
                    ))}
                </div>
            )}
        </PageShell>
    );
}

function RunCard({
    testId,
    run,
    router,
}: {
    testId: string;
    run: GradingRun;
    router: ReturnType<typeof useRouter>;
}) {
    const isPractice = run.kind === 'PRACTICE';
    const lifecycleLabel = LIFECYCLE_LABEL[run.lifecycle_status];
    const lifecycleTone = LIFECYCLE_TONE[run.lifecycle_status];

    const hasPending = run.ungraded_response_count > 0;
    const windowLabel = isPractice
        ? 'Practice attempts'
        : run.ends_at
            ? new Date(run.ends_at) > new Date()
                ? `Closes ${formatScheduled(run.ends_at)}`
                : `Closed ${formatScheduled(run.ends_at)}`
            : 'No window';

    return (
        <Card variant="surface" padding="md" interactive={run.is_gradable}>
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    {isPractice ? (
                        <p className="text-h3 font-semibold text-foreground">
                            Practice attempts
                        </p>
                    ) : (
                        <>
                            <p
                                className="text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim"
                                title={run.course_title ?? undefined}
                            >
                                {run.course_code ?? '—'}
                            </p>
                            <p className="mt-1 text-h3 font-semibold text-foreground">
                                {run.course_title ?? 'Scheduled run'}
                            </p>
                        </>
                    )}
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
                ) : (
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled
                        title={
                            run.ends_at && new Date(run.ends_at) > new Date()
                                ? `Available after ${formatScheduled(run.ends_at)}`
                                : 'Not yet gradable'
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

'use client';

/**
 * Analytics runs picker — Epoch 8.6 Stage 2.
 *
 * Mirrors the grading picker (one card per scheduled-session run plus a
 * Practice bucket when present), but pins a "Combined" card on top as the
 * recommended default. Splitting psychometrics by run halves the sample
 * per cohort and tanks reliability metrics — the combined card preserves
 * today's all-runs aggregate as the right default, with per-run drill-in
 * available for explicit cohort comparisons.
 */

import { useEffect, useMemo } from 'react';
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
    const otherRuns = runs.filter((r) => r.kind !== 'COMBINED');
    const isLoading = !runsByTestId[testId!] && status === 'loading';

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <PageShell width="wide">
                <BackButton href="/analytics" label="All blueprints" />

                <PageHeader
                    title={blueprint?.title ?? 'Choose a cohort'}
                    subtitle="The combined view pools every published submission across all runs (recommended for reliability). Open an individual run to inspect a single cohort."
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
                                <h2 className="text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim mb-3">
                                    Individual runs
                                </h2>
                                <div className="grid gap-4 lg:grid-cols-2">
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
                        Pools all published sessions across every run of this blueprint.
                        Best statistical power for reliability metrics.
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
    const isPractice = run.kind === 'PRACTICE';
    const hasData = run.submissions_total > 0;
    const lifecycleLabel = LIFECYCLE_LABEL[run.lifecycle_status];
    const lifecycleTone = LIFECYCLE_TONE[run.lifecycle_status];

    const windowLabel = isPractice
        ? 'Practice attempts'
        : run.ends_at
            ? new Date(run.ends_at) > new Date()
                ? `Closes ${formatScheduled(run.ends_at)}`
                : `Closed ${formatScheduled(run.ends_at)}`
            : 'No window';

    return (
        <Card variant="surface" padding="md" interactive={hasData}>
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

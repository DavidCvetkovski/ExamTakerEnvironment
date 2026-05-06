'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import AllItemsTable from '@/components/analytics/AllItemsTable';
import CutScoreSlider from '@/components/analytics/CutScoreSlider';
import FlaggedItemsTable from '@/components/analytics/FlaggedItemsTable';
import HistogramChart from '@/components/analytics/HistogramChart';
import StatCard from '@/components/analytics/StatCard';
import { useAnalyticsStore } from '@/stores/useAnalyticsStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { Button } from '@/components/ui';

function formatMetric(value: number | null, digits = 1): string {
    return value === null ? '—' : value.toFixed(digits);
}

export default function TestAnalyticsDashboardPage() {
    const { testId } = useParams<{ testId: string }>();
    const router = useRouter();
    const {
        bundles,
        scenarios,
        status,
        error,
        loadTestAnalytics,
        recompute,
        runCutScoreScenarios,
        clearError,
        setLastTestId,
    } = useAnalyticsStore();
    const { blueprints, fetchBlueprints } = useBlueprintStore();
    const { items, fetchItems } = useLibraryStore();
    const [cutScore, setCutScore] = useState(55);

    useEffect(() => {
        fetchBlueprints();
        fetchItems();
        if (testId) {
            void loadTestAnalytics(testId);
            setLastTestId(testId);
        }
    }, [fetchBlueprints, fetchItems, loadTestAnalytics, testId, setLastTestId]);

    const bundle = bundles[testId];

    useEffect(() => {
        if (bundle?.test.cut_score !== null && bundle?.test.cut_score !== undefined) {
            setCutScore(Math.round(bundle.test.cut_score));
        }
    }, [bundle?.test.cut_score]);

    useEffect(() => {
        if (!bundle || !testId) {
            return;
        }

        const timeout = window.setTimeout(() => {
            void runCutScoreScenarios(testId, [cutScore]);
        }, 300);

        return () => window.clearTimeout(timeout);
    }, [bundle, cutScore, runCutScoreScenarios, testId]);

    const testTitle = blueprints.find((blueprint) => blueprint.id === testId)?.title ?? 'Analytics Snapshot';
    const scenario = scenarios[testId]?.[0]
        ?? bundle?.test.cut_score_analysis.find((entry) => Math.round(entry.cut_score) === Math.round(cutScore));
    const flaggedItems = bundle?.items.filter((item) => item.flags.length > 0) ?? [];

    const getItemLabel = (learningObjectId: string) =>
        items.find((item) => item.id === learningObjectId)?.latest_content_preview
        ?? `Item ${learningObjectId.slice(0, 8)}`;

    const handleDownloadPdf = async () => {
        const { api: apiInstance } = await import('@/lib/api');
        const res = await apiInstance.get(`analytics/tests/${testId}/export.pdf`, { responseType: 'blob' });
        const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics_${testId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-screen bg-shell-bg text-foreground">
                <div className="border-b border-shell-border bg-shell-surface px-6 py-5">
                    <div className="mx-auto max-w-7xl">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setLastTestId(null);
                                router.push('/analytics');
                            }}
                        >
                            ← All tests
                        </Button>
                        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="text-eyebrow font-semibold uppercase tracking-medium text-shell-muted-dim">
                                    Test Dashboard
                                </p>
                                <h1 className="mt-2 text-3xl font-bold text-foreground">{testTitle}</h1>
                                <p className="mt-2 text-sm text-shell-muted">
                                    {bundle
                                        ? `${bundle.test.total_sessions} published sessions · computed ${
                                            bundle.test.computed_at ? new Date(bundle.test.computed_at).toLocaleString() : 'recently'
                                        }`
                                        : 'Loading analytics snapshot...'}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => { void handleDownloadPdf(); }}
                                    disabled={!bundle}
                                >
                                    ↓ Download PDF
                                </Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => void recompute(testId)}
                                >
                                    Recompute
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mx-auto max-w-7xl px-6 py-6">
                    {error ? (
                        <div className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-danger">
                            <span>{error}</span>
                            <button onClick={clearError} className="text-danger hover:text-foreground">Close</button>
                        </div>
                    ) : null}

                    {bundle?.test.is_stale ? (
                        <div className="mb-6 rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-4 py-3 text-sm text-[var(--color-warning-fg)]">
                            This snapshot may be stale because grades changed after publication.
                        </div>
                    ) : null}

                    {!bundle && status === 'loading' ? (
                        <div className="flex items-center justify-center py-24 text-shell-muted-dim">
                            <div className="mr-3 h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                            Loading analytics dashboard...
                        </div>
                    ) : null}

                    {!bundle && status !== 'loading' ? (
                        <div className="rounded-xl border border-dashed border-shell-border bg-shell-surface/50 px-6 py-16 text-center">
                            <p className="text-lg font-semibold text-foreground">No analytics snapshot yet</p>
                            <p className="mt-2 text-sm text-shell-muted-dim">
                                Publish graded results first, then recompute analytics for this test.
                            </p>
                        </div>
                    ) : null}

                    {bundle ? (
                        <div className="space-y-6">
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                <StatCard label="Mean" value={`${formatMetric(bundle.test.mean)}%`} accent="blue" />
                                <StatCard label="Median" value={`${formatMetric(bundle.test.median)}%`} accent="emerald" />
                                <StatCard label="Std Dev" value={formatMetric(bundle.test.std_dev, 2)} accent="amber" />
                                <StatCard label="Pass Rate" value={`${formatMetric(bundle.test.pass_rate)}%`} accent="rose" />
                                <StatCard label="Cronbach's Alpha" value={formatMetric(bundle.test.cronbach_alpha, 2)} accent="blue" />
                                <StatCard label="SEM" value={formatMetric(bundle.test.sem, 2)} accent="amber" />
                                <StatCard label="Min / Max" value={`${formatMetric(bundle.test.min_score)} / ${formatMetric(bundle.test.max_score)}%`} accent="slate" />
                                <StatCard label="Flagged Items" value={String(flaggedItems.length)} accent="rose" />
                            </div>

                            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                                <section>
                                    <div className="mb-3">
                                        <h2 className="text-lg font-semibold text-foreground">Score Distribution</h2>
                                        <p className="text-sm text-shell-muted-dim">Latest published session percentages grouped into score bands.</p>
                                    </div>
                                    <HistogramChart buckets={bundle.test.distribution} />
                                </section>

                                <section>
                                    <CutScoreSlider
                                        value={cutScore}
                                        baselineCut={bundle.test.cut_score}
                                        scenario={scenario}
                                        onChange={setCutScore}
                                    />
                                </section>
                            </div>

                            <section>
                                <div className="mb-3">
                                    <h2 className="text-lg font-semibold text-foreground">Flagged Items</h2>
                                    <p className="text-sm text-shell-muted-dim">Questions that look too easy, too hard, or weakly discriminating.</p>
                                </div>
                                <FlaggedItemsTable
                                    items={flaggedItems}
                                    testId={testId}
                                    getItemLabel={getItemLabel}
                                />
                            </section>

                            <section>
                                <div className="mb-3">
                                    <h2 className="text-lg font-semibold text-foreground">All Items</h2>
                                    <p className="text-sm text-shell-muted-dim">Inspect the full test set and filter by quality flags.</p>
                                </div>
                                <AllItemsTable
                                    items={bundle.items}
                                    testId={testId}
                                    getItemLabel={getItemLabel}
                                />
                            </section>
                        </div>
                    ) : null}
                </div>
            </div>
        </ProtectedRoute>
    );
}

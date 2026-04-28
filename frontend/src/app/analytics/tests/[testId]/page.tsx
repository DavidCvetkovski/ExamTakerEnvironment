'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import AllItemsTable from '@/components/analytics/AllItemsTable';
import CutScoreSlider from '@/components/analytics/CutScoreSlider';
import FlaggedItemsTable from '@/components/analytics/FlaggedItemsTable';
import HistogramChart from '@/components/analytics/HistogramChart';
import StatCard from '@/components/analytics/StatCard';
import { useAnalyticsStore } from '@/stores/useAnalyticsStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useLibraryStore } from '@/stores/useLibraryStore';

function formatMetric(value: number | null, digits = 1): string {
    return value === null ? '—' : value.toFixed(digits);
}

export default function TestAnalyticsDashboardPage() {
    const { testId } = useParams<{ testId: string }>();
    const {
        bundles,
        scenarios,
        status,
        error,
        loadTestAnalytics,
        recompute,
        runCutScoreScenarios,
        clearError,
    } = useAnalyticsStore();
    const { blueprints, fetchBlueprints } = useBlueprintStore();
    const { items, fetchItems } = useLibraryStore();
    const [cutScore, setCutScore] = useState(55);

    useEffect(() => {
        fetchBlueprints();
        fetchItems();
        if (testId) {
            void loadTestAnalytics(testId);
        }
    }, [fetchBlueprints, fetchItems, loadTestAnalytics, testId]);

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

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-screen bg-gray-950 text-gray-100">
                <div className="border-b border-gray-800 bg-gray-900 px-6 py-5">
                    <div className="mx-auto max-w-7xl">
                        <Link href="/analytics" className="text-sm text-blue-300 hover:text-blue-200">
                            ← Back to Analytics
                        </Link>
                        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">
                                    Test Dashboard
                                </p>
                                <h1 className="mt-2 text-3xl font-bold text-white">{testTitle}</h1>
                                <p className="mt-2 text-sm text-gray-400">
                                    {bundle
                                        ? `${bundle.test.total_sessions} published sessions · computed ${
                                            bundle.test.computed_at ? new Date(bundle.test.computed_at).toLocaleString() : 'recently'
                                        }`
                                        : 'Loading analytics snapshot...'}
                                </p>
                            </div>
                            <button
                                onClick={() => void recompute(testId)}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                            >
                                Recompute
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mx-auto max-w-7xl px-6 py-6">
                    {error ? (
                        <div className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-rose-800 bg-rose-900/20 px-4 py-3 text-sm text-rose-200">
                            <span>{error}</span>
                            <button onClick={clearError} className="text-rose-300 hover:text-white">Close</button>
                        </div>
                    ) : null}

                    {bundle?.test.is_stale ? (
                        <div className="mb-6 rounded-xl border border-amber-700/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                            This snapshot may be stale because grades changed after publication.
                        </div>
                    ) : null}

                    {!bundle && status === 'loading' ? (
                        <div className="flex items-center justify-center py-24 text-gray-500">
                            <div className="mr-3 h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                            Loading analytics dashboard...
                        </div>
                    ) : null}

                    {!bundle && status !== 'loading' ? (
                        <div className="rounded-xl border border-dashed border-gray-800 bg-gray-900/50 px-6 py-16 text-center">
                            <p className="text-lg font-semibold text-white">No analytics snapshot yet</p>
                            <p className="mt-2 text-sm text-gray-500">
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
                                        <h2 className="text-lg font-semibold text-white">Score Distribution</h2>
                                        <p className="text-sm text-gray-500">Latest published session percentages grouped into score bands.</p>
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
                                    <h2 className="text-lg font-semibold text-white">Flagged Items</h2>
                                    <p className="text-sm text-gray-500">Questions that look too easy, too hard, or weakly discriminating.</p>
                                </div>
                                <FlaggedItemsTable
                                    items={flaggedItems}
                                    testId={testId}
                                    getItemLabel={getItemLabel}
                                />
                            </section>

                            <section>
                                <div className="mb-3">
                                    <h2 className="text-lg font-semibold text-white">All Items</h2>
                                    <p className="text-sm text-gray-500">Inspect the full test set and filter by quality flags.</p>
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

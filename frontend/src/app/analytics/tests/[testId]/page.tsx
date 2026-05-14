'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import AllItemsTable from '@/components/analytics/AllItemsTable';
import CutScoreSlider from '@/components/analytics/CutScoreSlider';
import SectionAnalyticsPanel, { type SectionAnalytics } from '@/components/analytics/SectionAnalyticsPanel';
import FlaggedItemsTable from '@/components/analytics/FlaggedItemsTable';
import HistogramChart from '@/components/analytics/HistogramChart';
import StatCard from '@/components/analytics/StatCard';
import { useAnalyticsStore } from '@/stores/useAnalyticsStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { formatRelativeTime } from '@/lib/relativeTime';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { BackButton, Button, Spinner } from '@/components/ui';

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
    const [sections, setSections] = useState<SectionAnalytics[]>([]);
    const [activeSection, setActiveSection] = useState<number | null>(null);

    useEffect(() => {
        fetchBlueprints();
        fetchItems();
        if (testId) {
            void loadTestAnalytics(testId);
            setLastTestId(testId);
        }
    }, [fetchBlueprints, fetchItems, loadTestAnalytics, testId, setLastTestId]);

    // Fetch per-section aggregates (Epoch 8.4 Stage 9).
    useEffect(() => {
        if (!testId) return;
        let cancelled = false;
        (async () => {
            try {
                const { api: apiInstance } = await import('@/lib/api');
                const res = await apiInstance.get<{ sections: SectionAnalytics[] }>(
                    `analytics/tests/${testId}/sections`,
                );
                if (!cancelled) setSections(res.data?.sections ?? []);
            } catch {
                if (!cancelled) setSections([]);
            }
        })();
        return () => { cancelled = true; };
    }, [testId]);

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
            <div className="min-h-full bg-shell-bg text-foreground">
                <div className="border-b border-shell-border bg-shell-surface px-6 py-5">
                    <div className="mx-auto max-w-6xl">
                        <BackButton
                            onClick={() => {
                                setLastTestId(null);
                                router.push('/analytics');
                            }}
                            label="All tests"
                            className="mb-0"
                        />
                        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="text-eyebrow font-semibold uppercase tracking-medium text-shell-muted-dim">
                                    Test Dashboard
                                </p>
                                <h1 className="mt-2 text-3xl font-bold text-foreground">{testTitle}</h1>
                                <p className="mt-2 text-sm text-shell-muted">
                                    {bundle
                                        ? `${bundle.test.total_sessions} published sessions · computed ${
                                            bundle.test.computed_at ? formatRelativeTime(bundle.test.computed_at) : 'recently'
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

                <div className="mx-auto max-w-6xl px-6 py-6">
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
                        <div className="flex items-center justify-center py-24 text-shell-muted-dim gap-3">
                            <Spinner size="lg" />
                            Loading analytics dashboard…
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
                                <StatCard
                                    label="Mean"
                                    value={`${formatMetric(bundle.test.mean)}%`}
                                    accent="blue"
                                    info="Average score across all published sessions, in percent."
                                />
                                <StatCard
                                    label="Median"
                                    value={`${formatMetric(bundle.test.median)}%`}
                                    accent="emerald"
                                    info="The middle score: half of students scored higher, half scored lower. Less sensitive to outliers than the mean."
                                />
                                <StatCard
                                    label="Std Dev"
                                    value={formatMetric(bundle.test.std_dev, 2)}
                                    accent="amber"
                                    info="Spread of scores around the mean. A large value means scores are very different from each other; a small value means most students scored similarly."
                                />
                                <StatCard
                                    label="Pass Rate"
                                    value={`${formatMetric(bundle.test.pass_rate)}%`}
                                    accent="rose"
                                    info="Percentage of students who scored at or above the test's pass threshold."
                                />
                                <StatCard
                                    label="Cronbach's Alpha"
                                    value={formatMetric(bundle.test.cronbach_alpha, 2)}
                                    accent="blue"
                                    info="Internal consistency: how reliably the items measure the same thing. Above 0.7 is acceptable; above 0.8 is good. Below 0.6 means the items don't agree with each other."
                                />
                                <StatCard
                                    label="SEM"
                                    value={formatMetric(bundle.test.sem, 2)}
                                    accent="amber"
                                    info="Standard Error of Measurement. The expected fluctuation in a student's score if they took an equivalent version of this test. Smaller is better."
                                />
                                <StatCard
                                    label="Min / Max"
                                    value={`${formatMetric(bundle.test.min_score)} / ${formatMetric(bundle.test.max_score)}%`}
                                    accent="slate"
                                    info="Lowest and highest scores observed in the published sessions."
                                />
                                <StatCard
                                    label="Flagged Items"
                                    value={String(flaggedItems.length)}
                                    accent="rose"
                                    info="Items the system has flagged as too easy, too hard, or weakly discriminating, based on the most recent analytics snapshot."
                                />
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

                            {sections.length > 0 && (
                                <section>
                                    <div className="mb-3">
                                        <h2 className="text-lg font-semibold text-foreground">By section</h2>
                                        <p className="text-sm text-shell-muted-dim">Per-block aggregates. Click a section to filter the items table below.</p>
                                    </div>
                                    <SectionAnalyticsPanel
                                        sections={sections}
                                        activeBlock={activeSection}
                                        onSelect={setActiveSection}
                                    />
                                </section>
                            )}

                            <section>
                                <div className="mb-3">
                                    <h2 className="text-lg font-semibold text-foreground">All Items</h2>
                                    <p className="text-sm text-shell-muted-dim">
                                        {activeSection !== null && sections[activeSection]
                                            ? `Showing ${sections[activeSection].block_title} only.`
                                            : 'Inspect the full test set and filter by quality flags.'}
                                    </p>
                                </div>
                                <AllItemsTable
                                    items={(() => {
                                        if (activeSection === null) return bundle.items;
                                        const allowed = new Set(sections[activeSection]?.learning_object_ids ?? []);
                                        return bundle.items.filter((it) => allowed.has(it.learning_object_id));
                                    })()}
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

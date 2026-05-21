'use client';

import { useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import DistractorBars from '@/components/analytics/DistractorBars';
import { bundleKey, useAnalyticsStore } from '@/stores/useAnalyticsStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { BackButton, InfoTooltip, Spinner, StatCard } from '@/components/ui';
import { formatPercent, formatIndex, discriminationQuality } from '@/lib/analyticsFormat';

function discriminationStatTone(value: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
    const quality = discriminationQuality(value);
    if (quality === 'good') return 'success';
    if (quality === 'weak') return 'warning';
    if (quality === 'poor') return 'danger';
    return 'neutral';
}

export default function ItemAnalyticsDetailPage() {
    const { loId } = useParams<{ loId: string }>();
    const searchParams = useSearchParams();
    const {
        itemHistories,
        bundles,
        status,
        error,
        loadItemHistory,
        loadTestAnalytics,
        clearError,
    } = useAnalyticsStore();
    const { items, fetchItems } = useLibraryStore();

    useEffect(() => {
        fetchItems();
        if (loId) {
            void loadItemHistory(loId);
        }
    }, [fetchItems, loadItemHistory, loId]);

    const history = itemHistories[loId];
    const latestHistoryEntry = history?.entries[history.entries.length - 1];
    const sourceTestId = searchParams.get('fromTest') ?? latestHistoryEntry?.test_definition_id ?? null;
    const sourceRunId = searchParams.get('fromRun');
    const scopeRunId = sourceRunId && sourceRunId !== 'combined' ? sourceRunId : null;
    const backHref = sourceTestId
        ? sourceRunId
            ? `/analytics/tests/${sourceTestId}/run/${sourceRunId}`
            : `/analytics/tests/${sourceTestId}`
        : '/analytics';

    useEffect(() => {
        if (sourceTestId) {
            void loadTestAnalytics(sourceTestId, scopeRunId);
        }
    }, [loadTestAnalytics, sourceTestId, scopeRunId]);

    // Use the same run scope the user drilled in from ("combined" → all runs)
    // so the stats here match the table they clicked.
    const bundle = sourceTestId ? bundles[bundleKey(sourceTestId, scopeRunId)] : undefined;
    const latestItemStats = bundle?.items
        .filter((item) => item.learning_object_id === loId)
        .sort((left, right) => (right.version_number ?? 0) - (left.version_number ?? 0))[0];
    const libraryItem = items.find((item) => item.id === loId);
    const previewTitle = libraryItem?.latest_content_full || libraryItem?.latest_content_preview || `Item ${loId.slice(0, 8)}`;

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-full bg-shell-bg text-foreground">
                <div className="border-b border-shell-border bg-shell-surface px-6 py-5">
                    <div className="mx-auto max-w-6xl">
                        <BackButton
                            href={backHref}
                            label="Back to test analytics"
                        />
                        <div>
                            <p className="text-eyebrow font-semibold uppercase tracking-medium text-shell-muted-dim">
                                Item Analytics
                            </p>
                            <h1 className="mt-2 text-3xl font-bold text-foreground">{previewTitle}</h1>
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

                    {!history && status === 'loading' ? (
                        <div className="flex items-center justify-center py-24 text-shell-muted-dim gap-3">
                            <Spinner size="lg" />
                            Loading item history…
                        </div>
                    ) : null}

                    {history && history.entries.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-shell-border bg-shell-surface/50 px-6 py-16 text-center">
                            <p className="text-lg font-semibold text-foreground">No item analytics yet</p>
                            <p className="mt-2 text-sm text-shell-muted-dim">
                                This item has not appeared in any published analytics snapshot.
                            </p>
                        </div>
                    ) : null}

                    {history && history.entries.length > 0 ? (
                        <div className="space-y-6">
                            {latestItemStats ? (
                                <section className="grid gap-3 sm:grid-cols-2">
                                    <StatCard
                                        label="Avg. difficulty"
                                        value={formatPercent(
                                            latestItemStats.points_possible
                                                ? (latestItemStats.mean_score ?? 0) / latestItemStats.points_possible
                                                : null,
                                        )}
                                        note="Average points earned, as a % of max"
                                        info="The average score on this question across all responses, as a percentage of its maximum points. Higher = easier."
                                    />
                                    <StatCard
                                        label="Discrimination"
                                        value={formatIndex(latestItemStats.d_value)}
                                        tone={discriminationStatTone(latestItemStats.d_value)}
                                        note="How well it separates strong from weak students"
                                        info="0.30 or above is good; 0.15–0.30 is weak; below that (or negative) is poor. Essay questions with more than one point are excluded from calculation."
                                    />
                                </section>
                            ) : null}

                            {latestItemStats && latestItemStats.question_type !== 'ESSAY' && latestItemStats.distractors.length > 0 ? (
                                <section>
                                    <div className="mb-3 flex items-center gap-2">
                                        <h2 className="text-lg font-semibold text-foreground">Latest Distractor Breakdown</h2>
                                        <InfoTooltip>
                                            For each option, shows the share of students who picked it. A
                                            &quot;Non-functional&quot; distractor (chosen by &lt;5% of students) is dead weight —
                                            consider rewriting or removing it.
                                        </InfoTooltip>
                                    </div>
                                    <p className="mb-3 text-sm text-shell-muted-dim">
                                        Response share across all recorded responses.
                                    </p>
                                    <DistractorBars distractors={latestItemStats.distractors} />
                                </section>
                            ) : null}

                        </div>
                    ) : null}
                </div>
            </div>
        </ProtectedRoute>
    );
}

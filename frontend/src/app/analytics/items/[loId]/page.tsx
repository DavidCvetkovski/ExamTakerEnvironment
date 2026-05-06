'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import DistractorBars from '@/components/analytics/DistractorBars';
import PDValueTrendChart from '@/components/analytics/PDValueTrendChart';
import FlagBadge from '@/components/analytics/FlagBadge';
import { useAnalyticsStore } from '@/stores/useAnalyticsStore';
import { useLibraryStore } from '@/stores/useLibraryStore';

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
    const sourceHistoryEntry = history?.entries.find((entry) => entry.test_definition_id === sourceTestId) ?? latestHistoryEntry;

    useEffect(() => {
        if (sourceTestId) {
            void loadTestAnalytics(sourceTestId);
        }
    }, [loadTestAnalytics, sourceTestId]);

    const bundle = sourceTestId ? bundles[sourceTestId] : undefined;
    const latestItemStats = bundle?.items
        .filter((item) => item.learning_object_id === loId)
        .sort((left, right) => (right.version_number ?? 0) - (left.version_number ?? 0))[0];
    const previewTitle = items.find((item) => item.id === loId)?.latest_content_preview ?? `Item ${loId.slice(0, 8)}`;

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-screen bg-shell-bg text-foreground">
                <div className="border-b border-shell-border bg-shell-surface px-6 py-5">
                    <div className="mx-auto max-w-6xl">
                        <Link
                            href={sourceTestId ? `/analytics/tests/${sourceTestId}` : '/analytics'}
                            className="text-sm text-blue-300 hover:text-blue-200"
                        >
                            ← Back to Test
                        </Link>
                        <div className="mt-4">
                            <p className="text-eyebrow font-semibold uppercase tracking-medium text-shell-muted-dim">
                                Item Analytics
                            </p>
                            <h1 className="mt-2 text-3xl font-bold text-foreground">{previewTitle}</h1>
                            <p className="mt-2 text-sm text-shell-muted-dim">Learning Object {loId}</p>
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
                        <div className="flex items-center justify-center py-24 text-shell-muted-dim">
                            <div className="mr-3 h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                            Loading item history...
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
                            <section>
                                <div className="mb-3">
                                    <h2 className="text-lg font-semibold text-foreground">Version Trend</h2>
                                    <p className="text-sm text-shell-muted-dim">P-value and D-value progression across the recorded item history.</p>
                                </div>
                                <PDValueTrendChart entries={history.entries} />
                            </section>

                            {latestItemStats && latestItemStats.question_type !== 'ESSAY' && latestItemStats.distractors.length > 0 ? (
                                <section>
                                    <div className="mb-3">
                                        <h2 className="text-lg font-semibold text-foreground">Latest Distractor Breakdown</h2>
                                        <p className="text-sm text-shell-muted-dim">
                                            Response share for the loaded source test, {sourceHistoryEntry?.test_title ?? 'the latest test'}.
                                        </p>
                                    </div>
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

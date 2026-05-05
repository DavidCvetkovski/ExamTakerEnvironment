'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import DistractorBars from '@/components/analytics/DistractorBars';
import PDValueTrendChart from '@/components/analytics/PDValueTrendChart';
import VersionCard from '@/components/analytics/VersionCard';
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
            <div className="min-h-screen bg-gray-950 text-gray-100">
                <div className="border-b border-gray-800 bg-gray-900 px-6 py-5">
                    <div className="mx-auto max-w-6xl">
                        <Link
                            href={sourceTestId ? `/analytics/tests/${sourceTestId}` : '/analytics'}
                            className="text-sm text-blue-300 hover:text-blue-200"
                        >
                            ← Back to Test
                        </Link>
                        <div className="mt-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">
                                Item Analytics
                            </p>
                            <h1 className="mt-2 text-3xl font-bold text-white">{previewTitle}</h1>
                            <p className="mt-2 text-sm text-gray-500">Learning Object {loId}</p>
                        </div>
                    </div>
                </div>

                <div className="mx-auto max-w-6xl px-6 py-6">
                    {error ? (
                        <div className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-rose-800 bg-rose-900/20 px-4 py-3 text-sm text-rose-200">
                            <span>{error}</span>
                            <button onClick={clearError} className="text-rose-300 hover:text-white">Close</button>
                        </div>
                    ) : null}

                    {!history && status === 'loading' ? (
                        <div className="flex items-center justify-center py-24 text-gray-500">
                            <div className="mr-3 h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                            Loading item history...
                        </div>
                    ) : null}

                    {history && history.entries.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-800 bg-gray-900/50 px-6 py-16 text-center">
                            <p className="text-lg font-semibold text-white">No item analytics yet</p>
                            <p className="mt-2 text-sm text-gray-500">
                                This item has not appeared in any published analytics snapshot.
                            </p>
                        </div>
                    ) : null}

                    {history && history.entries.length > 0 ? (
                        <div className="space-y-6">
                            <section>
                                <div className="mb-3">
                                    <h2 className="text-lg font-semibold text-white">Version Trend</h2>
                                    <p className="text-sm text-gray-500">P-value and D-value progression across the recorded item history.</p>
                                </div>
                                <PDValueTrendChart entries={history.entries} />
                            </section>

                            {latestItemStats && latestItemStats.question_type !== 'ESSAY' && latestItemStats.distractors.length > 0 ? (
                                <section>
                                    <div className="mb-3">
                                        <h2 className="text-lg font-semibold text-white">Latest Distractor Breakdown</h2>
                                        <p className="text-sm text-gray-500">
                                            Response share for the loaded source test, {sourceHistoryEntry?.test_title ?? 'the latest test'}.
                                        </p>
                                    </div>
                                    <DistractorBars distractors={latestItemStats.distractors} />
                                </section>
                            ) : null}

                            <section>
                                <div className="mb-3">
                                    <h2 className="text-lg font-semibold text-white">Flags Timeline</h2>
                                    <p className="text-sm text-gray-500">A quick scan of which revisions attracted quality flags.</p>
                                </div>
                                <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-5">
                                    <div className="space-y-4">
                                        {history.entries.map((entry) => (
                                            <div
                                                key={`${entry.item_version_id}-${entry.test_definition_id}`}
                                                className="flex flex-col gap-3 border-b border-gray-800 pb-4 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                                            >
                                                <div>
                                                    <p className="text-sm font-semibold text-white">
                                                        Version {entry.version_number ?? '—'} · {entry.test_title}
                                                    </p>
                                                    <p className="mt-1 text-xs text-gray-500">
                                                        {entry.computed_at ? new Date(entry.computed_at).toLocaleString() : 'No timestamp'}
                                                    </p>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {entry.flags.length > 0 ? (
                                                        entry.flags.map((flag) => (
                                                            <FlagBadge key={`${entry.item_version_id}-${flag.code}`} code={flag.code} />
                                                        ))
                                                    ) : (
                                                        <span className="text-xs text-gray-500">No flags</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </section>

                            <section>
                                <div className="mb-3">
                                    <h2 className="text-lg font-semibold text-white">Per-Version Detail</h2>
                                    <p className="text-sm text-gray-500">Snapshot metrics for each recorded version/test pairing.</p>
                                </div>
                                <div className="grid gap-4 lg:grid-cols-2">
                                    {history.entries.map((entry, index) => (
                                        <VersionCard
                                            key={`${entry.item_version_id}-${entry.test_definition_id}`}
                                            entry={entry}
                                            isLatest={index === history.entries.length - 1}
                                        />
                                    ))}
                                </div>
                            </section>
                        </div>
                    ) : null}
                </div>
            </div>
        </ProtectedRoute>
    );
}

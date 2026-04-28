'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { ItemAnalyticsResponse } from '@/lib/analytics.types';
import FlagBadge from './FlagBadge';

type SortKey = 'stem' | 'p' | 'd' | 'version';

interface FlaggedItemsTableProps {
    items: ItemAnalyticsResponse[];
    testId: string;
    getItemLabel: (learningObjectId: string) => string;
}

function formatMetric(value: number | null): string {
    return value === null ? '—' : value.toFixed(2);
}

export default function FlaggedItemsTable({
    items,
    testId,
    getItemLabel,
}: FlaggedItemsTableProps) {
    const [sortKey, setSortKey] = useState<SortKey>('d');

    const sortedItems = [...items].sort((left, right) => {
        if (sortKey === 'stem') {
            return getItemLabel(left.learning_object_id).localeCompare(getItemLabel(right.learning_object_id));
        }
        if (sortKey === 'version') {
            return (right.version_number ?? 0) - (left.version_number ?? 0);
        }
        if (sortKey === 'p') {
            return (left.p_value ?? 999) - (right.p_value ?? 999);
        }
        return (left.d_value ?? 999) - (right.d_value ?? 999);
    });

    if (items.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-gray-800 bg-gray-900/50 px-4 py-10 text-center text-sm text-gray-500">
                No flagged items on the latest analytics snapshot.
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-800 px-4 py-3">
                <p className="text-sm font-semibold text-white">Flagged Items</p>
                <div className="flex-1" />
                {[
                    { key: 'd', label: 'Sort D' },
                    { key: 'p', label: 'Sort P' },
                    { key: 'version', label: 'Sort Version' },
                    { key: 'stem', label: 'Sort Stem' },
                ].map((option) => (
                    <button
                        key={option.key}
                        onClick={() => setSortKey(option.key as SortKey)}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                            sortKey === option.key
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:text-white'
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-950/70 text-[11px] uppercase tracking-[0.18em] text-gray-500">
                        <tr>
                            <th className="px-4 py-3 text-left">Item</th>
                            <th className="px-4 py-3 text-left">Version</th>
                            <th className="px-4 py-3 text-left">P</th>
                            <th className="px-4 py-3 text-left">D</th>
                            <th className="px-4 py-3 text-left">Flags</th>
                            <th className="px-4 py-3 text-right">Open</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {sortedItems.map((item) => (
                            <tr key={item.item_version_id} className="hover:bg-gray-800/40">
                                <td className="px-4 py-4">
                                    <div className="font-medium text-white">{getItemLabel(item.learning_object_id)}</div>
                                    <div className="mt-1 text-xs text-gray-500">{item.learning_object_id.slice(0, 8)}</div>
                                </td>
                                <td className="px-4 py-4 text-gray-300">v{item.version_number ?? '—'}</td>
                                <td className="px-4 py-4 text-gray-300">{formatMetric(item.p_value)}</td>
                                <td className="px-4 py-4 text-gray-300">{formatMetric(item.d_value)}</td>
                                <td className="px-4 py-4">
                                    <div className="flex flex-wrap gap-2">
                                        {item.flags.map((flag) => (
                                            <FlagBadge key={`${item.item_version_id}-${flag.code}`} code={flag.code} />
                                        ))}
                                    </div>
                                </td>
                                <td className="px-4 py-4 text-right">
                                    <Link
                                        href={`/analytics/items/${item.learning_object_id}?fromTest=${testId}`}
                                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                                    >
                                        Inspect
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

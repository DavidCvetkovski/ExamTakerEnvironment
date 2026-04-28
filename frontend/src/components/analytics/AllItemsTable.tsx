'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { ItemAnalyticsResponse } from '@/lib/analytics.types';
import FlagBadge from './FlagBadge';

type SortKey = 'stem' | 'p' | 'd' | 'responses';

interface AllItemsTableProps {
    items: ItemAnalyticsResponse[];
    testId: string;
    getItemLabel: (learningObjectId: string) => string;
}

function formatMetric(value: number | null): string {
    return value === null ? '—' : value.toFixed(2);
}

export default function AllItemsTable({
    items,
    testId,
    getItemLabel,
}: AllItemsTableProps) {
    const [sortKey, setSortKey] = useState<SortKey>('stem');
    const [activeFlag, setActiveFlag] = useState<string>('ALL');

    const availableFlags = Array.from(
        new Set(items.flatMap((item) => item.flags.map((flag) => flag.code))),
    );

    const visibleItems = items
        .filter((item) => activeFlag === 'ALL' || item.flags.some((flag) => flag.code === activeFlag))
        .sort((left, right) => {
            if (sortKey === 'stem') {
                return getItemLabel(left.learning_object_id).localeCompare(getItemLabel(right.learning_object_id));
            }
            if (sortKey === 'responses') {
                return right.n_responses - left.n_responses;
            }
            if (sortKey === 'p') {
                return (left.p_value ?? 999) - (right.p_value ?? 999);
            }
            return (left.d_value ?? 999) - (right.d_value ?? 999);
        });

    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="border-b border-gray-800 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white">All Items</p>
                    <div className="flex-1" />
                    {[
                        { key: 'stem', label: 'Sort Stem' },
                        { key: 'responses', label: 'Sort N' },
                        { key: 'p', label: 'Sort P' },
                        { key: 'd', label: 'Sort D' },
                    ].map((option) => (
                        <button
                            key={option.key}
                            onClick={() => setSortKey(option.key as SortKey)}
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                                sortKey === option.key
                                    ? 'bg-cyan-600 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:text-white'
                            }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        onClick={() => setActiveFlag('ALL')}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                            activeFlag === 'ALL'
                                ? 'bg-white text-gray-950'
                                : 'bg-gray-800 text-gray-400 hover:text-white'
                        }`}
                    >
                        All
                    </button>
                    {availableFlags.map((flagCode) => (
                        <button
                            key={flagCode}
                            onClick={() => setActiveFlag(flagCode)}
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                                activeFlag === flagCode
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:text-white'
                            }`}
                        >
                            {flagCode.replaceAll('_', ' ')}
                        </button>
                    ))}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-950/70 text-[11px] uppercase tracking-[0.18em] text-gray-500">
                        <tr>
                            <th className="px-4 py-3 text-left">Item</th>
                            <th className="px-4 py-3 text-left">Type</th>
                            <th className="px-4 py-3 text-left">Version</th>
                            <th className="px-4 py-3 text-left">P</th>
                            <th className="px-4 py-3 text-left">D</th>
                            <th className="px-4 py-3 text-left">Responses</th>
                            <th className="px-4 py-3 text-left">Flags</th>
                            <th className="px-4 py-3 text-right">Open</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {visibleItems.map((item) => (
                            <tr key={item.item_version_id} className="hover:bg-gray-800/40">
                                <td className="px-4 py-4">
                                    <div className="font-medium text-white">{getItemLabel(item.learning_object_id)}</div>
                                    <div className="mt-1 text-xs text-gray-500">{item.learning_object_id.slice(0, 8)}</div>
                                </td>
                                <td className="px-4 py-4 text-gray-300">
                                    {item.question_type?.replaceAll('_', ' ') ?? '—'}
                                </td>
                                <td className="px-4 py-4 text-gray-300">v{item.version_number ?? '—'}</td>
                                <td className="px-4 py-4 text-gray-300">{formatMetric(item.p_value)}</td>
                                <td className="px-4 py-4 text-gray-300">{formatMetric(item.d_value)}</td>
                                <td className="px-4 py-4 text-gray-300">{item.n_responses}</td>
                                <td className="px-4 py-4">
                                    {item.flags.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {item.flags.map((flag) => (
                                                <FlagBadge key={`${item.item_version_id}-${flag.code}`} code={flag.code} />
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-gray-500">Clean</span>
                                    )}
                                </td>
                                <td className="px-4 py-4 text-right">
                                    <Link
                                        href={`/analytics/items/${item.learning_object_id}?fromTest=${testId}`}
                                        className="rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 hover:border-gray-500 hover:text-white"
                                    >
                                        Drill Down
                                    </Link>
                                </td>
                            </tr>
                        ))}
                        {visibleItems.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                                    No items match the active flag filter.
                                </td>
                            </tr>
                        ) : null}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

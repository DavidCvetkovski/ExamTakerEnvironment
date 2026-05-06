'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ItemAnalyticsResponse } from '@/lib/analytics.types';
import { Button, InfoTooltip } from '@/components/ui';
import FlagBadge from './FlagBadge';

type SortKey = 'stem' | 'p' | 'd';

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
    const router = useRouter();
    const [sortKey, setSortKey] = useState<SortKey>('d');

    const sortedItems = [...items].sort((left, right) => {
        if (sortKey === 'stem') {
            return getItemLabel(left.learning_object_id).localeCompare(getItemLabel(right.learning_object_id));
        }
        if (sortKey === 'p') {
            return (left.p_value ?? 999) - (right.p_value ?? 999);
        }
        return (left.d_value ?? 999) - (right.d_value ?? 999);
    });

    if (items.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-shell-border bg-shell-surface/50 px-4 py-10 text-center text-sm text-shell-muted-dim">
                No flagged items on the latest analytics snapshot.
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-shell-border bg-shell-surface overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-shell-border px-4 py-3">
                <p className="text-sm font-semibold text-foreground">Flagged Items</p>
                <div className="flex-1" />
                {([
                    { key: 'd', label: 'Sort D' },
                    { key: 'p', label: 'Sort P' },
                    { key: 'stem', label: 'Sort Stem' },
                ] as const).map((option) => (
                    <button
                        key={option.key}
                        onClick={() => setSortKey(option.key)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            sortKey === option.key
                                ? 'bg-brand text-white'
                                : 'bg-shell-input text-shell-muted hover:text-foreground'
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-shell-bg/70 text-eyebrow uppercase tracking-eyebrow text-shell-muted-dim">
                        <tr>
                            <th className="px-4 py-3 text-left">Item</th>
                            <th className="px-4 py-3 text-left">
                                <span className="inline-flex items-center gap-1.5">
                                    P
                                    <InfoTooltip>
                                        Difficulty (P-value): proportion of students who answered correctly.
                                        0.20 = very hard, 0.90 = very easy. The sweet spot is roughly 0.30–0.80.
                                    </InfoTooltip>
                                </span>
                            </th>
                            <th className="px-4 py-3 text-left">
                                <span className="inline-flex items-center gap-1.5">
                                    D
                                    <InfoTooltip>
                                        Discrimination (D-value): how well this item separates strong students from weak students.
                                        Above 0.30 is good; below 0.15 is poor; negative means the item is misleading.
                                    </InfoTooltip>
                                </span>
                            </th>
                            <th className="px-4 py-3 text-left">Flags</th>
                            <th className="px-4 py-3 text-right">Open</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-shell-border">
                        {sortedItems.map((item) => (
                            <tr key={item.item_version_id} className="hover:bg-shell-input/40">
                                <td className="px-4 py-4">
                                    <div className="font-medium text-foreground">{getItemLabel(item.learning_object_id)}</div>
                                    <div className="mt-1 text-xs text-shell-muted-dim">{item.learning_object_id.slice(0, 8)}</div>
                                </td>
                                <td className="px-4 py-4 text-shell-muted tabular-nums">{formatMetric(item.p_value)}</td>
                                <td className="px-4 py-4 text-shell-muted tabular-nums">{formatMetric(item.d_value)}</td>
                                <td className="px-4 py-4">
                                    <div className="flex flex-wrap gap-2">
                                        {item.flags.map((flag) => (
                                            <FlagBadge key={`${item.item_version_id}-${flag.code}`} code={flag.code} />
                                        ))}
                                    </div>
                                </td>
                                <td className="px-4 py-4 text-right">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => router.push(`/analytics/items/${item.learning_object_id}?fromTest=${testId}`)}
                                    >
                                        Drill down →
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

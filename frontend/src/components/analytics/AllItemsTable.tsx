'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ItemAnalyticsResponse } from '@/lib/analytics.types';
import { Button } from '@/components/ui';
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
    const router = useRouter();
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

    const sortBtnClass = (key: SortKey) =>
        `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            sortKey === key
                ? 'text-foreground'
                : 'bg-shell-input text-shell-muted hover:text-foreground'
        }`;

    return (
        <div className="rounded-xl border border-shell-border bg-shell-surface overflow-hidden">
            <div className="border-b border-shell-border px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">All Items</p>
                    <div className="flex-1" />
                    {([
                        { key: 'stem', label: 'Sort Stem' },
                        { key: 'responses', label: 'Sort N' },
                        { key: 'p', label: 'Sort P' },
                        { key: 'd', label: 'Sort D' },
                    ] as const).map((option) => (
                        <button
                            key={option.key}
                            onClick={() => setSortKey(option.key)}
                            className={sortBtnClass(option.key)}
                            style={sortKey === option.key ? { backgroundColor: 'var(--color-brand)', opacity: 1 } : {}}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        onClick={() => setActiveFlag('ALL')}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            activeFlag === 'ALL'
                                ? 'bg-shell-border text-foreground'
                                : 'bg-shell-input text-shell-muted hover:text-foreground'
                        }`}
                    >
                        All
                    </button>
                    {availableFlags.map((flagCode) => (
                        <button
                            key={flagCode}
                            onClick={() => setActiveFlag(flagCode)}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                activeFlag === flagCode
                                    ? 'text-foreground'
                                    : 'bg-shell-input text-shell-muted hover:text-foreground'
                            }`}
                            style={activeFlag === flagCode ? { backgroundColor: 'var(--color-brand)' } : {}}
                        >
                            {flagCode.replaceAll('_', ' ')}
                        </button>
                    ))}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-shell-bg/70 text-eyebrow uppercase tracking-eyebrow text-shell-muted-dim">
                        <tr>
                            <th className="px-4 py-3 text-left">Item</th>
                            <th className="px-4 py-3 text-left">Type</th>
                            <th className="px-4 py-3 text-left">P</th>
                            <th className="px-4 py-3 text-left">D</th>
                            <th className="px-4 py-3 text-left">Responses</th>
                            <th className="px-4 py-3 text-left">Flags</th>
                            <th className="px-4 py-3 text-right">Open</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-shell-border">
                        {visibleItems.map((item) => (
                            <tr key={item.item_version_id} className="hover:bg-shell-input/40">
                                <td className="px-4 py-4">
                                    <div className="font-medium text-foreground">{getItemLabel(item.learning_object_id)}</div>
                                    <div className="mt-1 text-xs text-shell-muted-dim">{item.learning_object_id.slice(0, 8)}</div>
                                </td>
                                <td className="px-4 py-4 text-shell-muted">
                                    {item.question_type?.replaceAll('_', ' ') ?? '—'}
                                </td>
                                <td className="px-4 py-4 text-shell-muted tabular-nums">{formatMetric(item.p_value)}</td>
                                <td className="px-4 py-4 text-shell-muted tabular-nums">{formatMetric(item.d_value)}</td>
                                <td className="px-4 py-4 text-shell-muted tabular-nums">{item.n_responses}</td>
                                <td className="px-4 py-4">
                                    {item.flags.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {item.flags.map((flag) => (
                                                <FlagBadge key={`${item.item_version_id}-${flag.code}`} code={flag.code} />
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-shell-muted-dim">Clean</span>
                                    )}
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
                        {visibleItems.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-10 text-center text-sm text-shell-muted-dim">
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

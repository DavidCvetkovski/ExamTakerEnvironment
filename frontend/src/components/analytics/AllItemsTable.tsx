'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ItemAnalyticsResponse } from '@/lib/analytics.types';
import { Button, InfoTooltip, SortArrow, useToast } from '@/components/ui';
import {
    formatPercent,
    formatIndex,
    discriminationQuality,
    DISCRIMINATION_LABEL,
    DISCRIMINATION_TONE,
} from '@/lib/analyticsFormat';
import FlagBadge from './FlagBadge';

type SortKey = 'stem' | 'type' | 'p' | 'd' | 'responses' | 'flags';
type SortDir = 'asc' | 'desc';

interface AllItemsTableProps {
    items: ItemAnalyticsResponse[];
    testId: string;
    /** URL run segment the drill-down should return to (e.g. "combined" or a run id). */
    runId?: string;
    getItemLabel: (learningObjectId: string) => string;
}

// Points-based difficulty (avg points ÷ max), defined for every question type
// — unlike p-value, which is N/A for essays. Higher = easier. Keeps the table,
// section panel, and drill-down showing the same "difficulty" number.
function itemDifficulty(item: ItemAnalyticsResponse): number | null {
    return item.points_possible ? (item.mean_score ?? 0) / item.points_possible : null;
}

function DiscriminationTag({ value }: { value: number | null }) {
    const quality = discriminationQuality(value);
    if (!quality) return null;
    return (
        <span className="ml-2 text-xs font-medium" style={{ color: DISCRIMINATION_TONE[quality] }}>
            {DISCRIMINATION_LABEL[quality]}
        </span>
    );
}

export default function AllItemsTable({
    items,
    testId,
    runId,
    getItemLabel,
}: AllItemsTableProps) {
    const router = useRouter();
    const { toast } = useToast();

    const copyId = (learningObjectId: string) => {
        navigator.clipboard.writeText(learningObjectId).then(() => {
            toast({ tone: 'success', title: 'ID copied' });
        });
    };
    const [sortKey, setSortKey] = useState<SortKey>('stem');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [activeFlag, setActiveFlag] = useState<string>('ALL');

    const availableFlags = Array.from(
        new Set(items.flatMap((item) => item.flags.map((flag) => flag.code))),
    );

    // If the item set changes (e.g. a section is selected) and the active flag
    // no longer applies, treat it as ALL — without this the table would get
    // stuck empty behind a filter whose chip has disappeared.
    const effectiveFlag = activeFlag !== 'ALL' && !availableFlags.includes(activeFlag) ? 'ALL' : activeFlag;

    const toggleSort = (key: SortKey) => {
        if (key === sortKey) {
            setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const visibleItems = items
        .filter((item) => effectiveFlag === 'ALL' || item.flags.some((flag) => flag.code === effectiveFlag))
        .sort((left, right) => {
            let cmp: number;
            if (sortKey === 'stem') {
                cmp = getItemLabel(left.learning_object_id).localeCompare(getItemLabel(right.learning_object_id));
            } else if (sortKey === 'type') {
                cmp = (left.question_type ?? '').localeCompare(right.question_type ?? '');
            } else if (sortKey === 'responses') {
                cmp = left.n_responses - right.n_responses;
            } else if (sortKey === 'p') {
                cmp = (itemDifficulty(left) ?? 999) - (itemDifficulty(right) ?? 999);
            } else if (sortKey === 'flags') {
                cmp = left.flags.length - right.flags.length;
            } else {
                cmp = (left.d_value ?? 999) - (right.d_value ?? 999);
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });

    const sortableHead = (key: SortKey, label: React.ReactNode, align: 'left' | 'right' = 'left') => (
        <th
            className={`px-4 py-3 ${align === 'right' ? 'text-right' : 'text-left'} cursor-pointer select-none hover:text-foreground`}
            onClick={() => toggleSort(key)}
        >
            <span className="inline-flex items-center gap-1.5">
                {label}
                <SortArrow active={sortKey === key} dir={sortDir} />
            </span>
        </th>
    );

    return (
        <div className="rounded-xl border border-shell-border bg-shell-surface overflow-hidden">
            <div className="border-b border-shell-border px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">All Items</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        onClick={() => setActiveFlag('ALL')}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            effectiveFlag === 'ALL'
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
                                effectiveFlag === flagCode
                                    ? 'bg-brand text-white'
                                    : 'bg-shell-input text-shell-muted hover:text-foreground'
                            }`}
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
                            {sortableHead('stem', 'Item')}
                            {sortableHead('type', 'Type')}
                            {sortableHead('p', (
                                <span className="inline-flex items-center gap-1.5">
                                    Difficulty
                                    <InfoTooltip>
                                        Average score on this question as a percentage of its maximum points.
                                        Higher = easier. 20% = very hard, 90% = very easy; the sweet spot is roughly 30–80%.
                                    </InfoTooltip>
                                </span>
                            ))}
                            {sortableHead('d', (
                                <span className="inline-flex items-center gap-1.5">
                                    Discrimination
                                    <InfoTooltip>
                                        How well this question separates students who did well overall from those who didn&apos;t.
                                        0.30 or above is good; 0.15–0.30 is weak; below that (or negative) is poor. Essay questions with more than one point are excluded from calculation.
                                    </InfoTooltip>
                                </span>
                            ))}
                            {sortableHead('responses', 'Graded')}
                            {sortableHead('flags', 'Flags')}
                            <th className="px-4 py-3 text-right">Open</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-shell-border">
                        {visibleItems.map((item) => (
                            <tr key={item.item_version_id} className="hover:bg-shell-input/40">
                                <td className="px-4 py-4">
                                    <div className="font-medium text-foreground">{getItemLabel(item.learning_object_id)}</div>
                                </td>
                                <td className="px-4 py-4 text-shell-muted">
                                    {item.question_type?.replaceAll('_', ' ') ?? '—'}
                                </td>
                                <td className="px-4 py-4 text-shell-muted tabular-nums">{formatPercent(itemDifficulty(item))}</td>
                                <td className="px-4 py-4 text-shell-muted tabular-nums">
                                    {formatIndex(item.d_value)}
                                    <DiscriminationTag value={item.d_value} />
                                </td>
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
                                <td className="px-4 py-4 text-right whitespace-nowrap">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => copyId(item.learning_object_id)}
                                        title="Copy question ID"
                                    >
                                        Copy ID
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => router.push(
                                            `/analytics/items/${item.learning_object_id}?fromTest=${testId}${runId ? `&fromRun=${runId}` : ''}`,
                                        )}
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

'use client';

import { cn } from '@/components/ui';
import { formatPercent, formatIndex } from '@/lib/analyticsFormat';

export interface SectionAnalytics {
    block_index: number;
    block_title: string;
    question_count: number;
    graded_item_count: number;
    p_value_mean: number | null;
    discrimination_mean: number | null;
    mean_score: number | null;
    learning_object_ids: string[];
}

interface SectionAnalyticsPanelProps {
    sections: SectionAnalytics[];
    activeBlock: number | null;
    onSelect: (blockIndex: number | null) => void;
}

export default function SectionAnalyticsPanel({ sections, activeBlock, onSelect }: SectionAnalyticsPanelProps) {
    if (sections.length === 0) {
        return (
            <p className="text-meta text-shell-muted-dim italic">
                This blueprint has no sections — analytics shown at the test level only.
            </p>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => onSelect(null)}
                    className={cn(
                        'rounded-full border px-3 py-1 text-meta font-medium transition-colors',
                        activeBlock === null
                            ? 'border-brand bg-brand/10 text-brand'
                            : 'border-shell-border text-shell-muted hover:text-foreground hover:border-shell-border-deep',
                    )}
                >
                    {activeBlock === null ? 'All sections' : 'Show all sections'}
                </button>
                <span className="text-meta text-shell-muted-dim">
                    {activeBlock === null
                        ? 'Pick a section to filter the items table below.'
                        : 'Items table is filtered to the selected section.'}
                </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {sections.map((section) => {
                    const isActive = activeBlock === section.block_index;
                    return (
                        <button
                            key={section.block_index}
                            type="button"
                            onClick={() => onSelect(isActive ? null : section.block_index)}
                            className={cn(
                                'text-left rounded-xl border bg-shell-surface px-4 py-3 transition-colors',
                                'hover:border-shell-border-deep',
                                isActive
                                    ? 'border-brand ring-2 ring-brand/30'
                                    : 'border-shell-border',
                            )}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold text-foreground line-clamp-1">{section.block_title}</p>
                                <span className="text-eyebrow font-semibold uppercase tracking-wide text-shell-muted-dim shrink-0">
                                    {section.question_count === section.graded_item_count
                                        ? `${section.question_count} questions`
                                        : `${section.question_count} questions · ${section.graded_item_count} graded`}
                                </span>
                            </div>
                            <dl className="mt-3 grid grid-cols-2 gap-3 text-meta">
                                <div>
                                    <dt className="text-shell-muted-dim">Avg. difficulty</dt>
                                    <dd className="font-semibold text-foreground tabular-nums">{formatPercent(section.mean_score)}</dd>
                                </div>
                                <div>
                                    <dt className="text-shell-muted-dim">Avg. discrimination</dt>
                                    <dd className="font-semibold text-foreground tabular-nums">{formatIndex(section.discrimination_mean)}</dd>
                                </div>
                            </dl>
                            {section.graded_item_count === 0 && (
                                <p className="mt-2 text-eyebrow text-shell-muted-dim italic">
                                    No graded responses yet for this section.
                                </p>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

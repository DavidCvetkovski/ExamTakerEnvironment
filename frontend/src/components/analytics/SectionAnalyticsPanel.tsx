'use client';

import { cn } from '@/components/ui';

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

function fmt(value: number | null, digits = 2): string {
    return value === null ? '—' : value.toFixed(digits);
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
                    All sections
                </button>
                {activeBlock !== null && (
                    <span className="text-meta text-shell-muted-dim">
                        Filtering items table to this section
                    </span>
                )}
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
                                    {section.question_count} q
                                </span>
                            </div>
                            <dl className="mt-3 grid grid-cols-3 gap-3 text-meta">
                                <div>
                                    <dt className="text-shell-muted-dim">P̄</dt>
                                    <dd className="font-semibold text-foreground tabular-nums">{fmt(section.p_value_mean)}</dd>
                                </div>
                                <div>
                                    <dt className="text-shell-muted-dim">D̄</dt>
                                    <dd className="font-semibold text-foreground tabular-nums">{fmt(section.discrimination_mean)}</dd>
                                </div>
                                <div>
                                    <dt className="text-shell-muted-dim">Score</dt>
                                    <dd className="font-semibold text-foreground tabular-nums">{fmt(section.mean_score)}</dd>
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

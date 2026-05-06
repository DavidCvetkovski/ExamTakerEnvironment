'use client';

import type { DistractorStat } from '@/lib/analytics.types';
import { Badge } from '@/components/ui';

export default function DistractorBars({ distractors }: { distractors: DistractorStat[] }) {
    if (distractors.length === 0) {
        return null;
    }

    return (
        <div className="rounded-xl border border-shell-border bg-shell-surface px-5 py-5">
            <div className="space-y-4">
                {distractors.map((distractor) => (
                    <div key={distractor.option_index}>
                        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-shell-input text-xs font-semibold text-foreground">
                                    {String.fromCharCode(65 + distractor.option_index)}
                                </span>
                                <div>
                                    <p className="font-medium text-foreground">
                                        {distractor.option_text || `Option ${distractor.option_index + 1}`}
                                    </p>
                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                        {distractor.is_correct ? (
                                            <Badge tone="success" size="sm">Correct</Badge>
                                        ) : null}
                                        {distractor.is_non_functional ? (
                                            <Badge tone="warning" size="sm">Non-functional</Badge>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                            <span className="text-sm font-semibold text-brand">
                                {distractor.percentage.toFixed(1)}%
                            </span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-shell-bg">
                            <div
                                className={`h-full rounded-full ${
                                    distractor.is_correct ? 'bg-success' : 'bg-brand'
                                }`}
                                style={{ width: `${Math.max(distractor.percentage, distractor.count > 0 ? 3 : 0)}%` }}
                            />
                        </div>
                        <p className="mt-1 text-xs text-shell-muted-dim">{distractor.count} selections</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

'use client';

import Link from 'next/link';

import type { ItemHistoryEntry } from '@/lib/analytics.types';
import FlagBadge from './FlagBadge';

function formatMetric(value: number | null): string {
    return value === null ? '—' : value.toFixed(2);
}

export default function VersionCard({
    entry,
    isLatest = false,
}: {
    entry: ItemHistoryEntry;
    isLatest?: boolean;
}) {
    return (
        <div className={`rounded-xl border px-4 py-4 ${
            isLatest
                ? 'border-cyan-500/40 bg-cyan-500/5'
                : 'border-shell-border bg-shell-surface'
        }`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">Version {entry.version_number ?? '—'}</p>
                        {isLatest ? (
                            <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-eyebrow font-semibold text-cyan-200">
                                Latest
                            </span>
                        ) : null}
                    </div>
                    <p className="mt-1 text-xs text-shell-muted-dim">{entry.test_title}</p>
                </div>
                <Link
                    href={`/analytics/tests/${entry.test_definition_id}`}
                    className="rounded-lg border border-shell-border-deep px-3 py-2 text-xs font-semibold text-foreground hover:border-gray-500 hover:text-foreground"
                >
                    Open Test
                </Link>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-shell-border bg-shell-bg/70 px-3 py-3">
                    <p className="text-eyebrow uppercase tracking-eyebrow text-shell-muted-dim">P-value</p>
                    <p className="mt-2 text-lg font-semibold text-cyan-300">{formatMetric(entry.p_value)}</p>
                </div>
                <div className="rounded-lg border border-shell-border bg-shell-bg/70 px-3 py-3">
                    <p className="text-eyebrow uppercase tracking-eyebrow text-shell-muted-dim">D-value</p>
                    <p className="mt-2 text-lg font-semibold text-amber-300">{formatMetric(entry.d_value)}</p>
                </div>
                <div className="rounded-lg border border-shell-border bg-shell-bg/70 px-3 py-3">
                    <p className="text-eyebrow uppercase tracking-eyebrow text-shell-muted-dim">Responses</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{entry.n_responses}</p>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
                {entry.flags.length > 0 ? (
                    entry.flags.map((flag) => <FlagBadge key={`${entry.item_version_id}-${flag.code}`} code={flag.code} />)
                ) : (
                    <span className="text-xs text-shell-muted-dim">No quality flags on this snapshot.</span>
                )}
            </div>
        </div>
    );
}

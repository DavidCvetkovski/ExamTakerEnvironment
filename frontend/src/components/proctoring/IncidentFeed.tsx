'use client';

import { EmptyState } from '@/components/ui';
import { formatRelativeTime } from '@/lib/relativeTime';
import type {
    IncidentSeverityFilter,
    ProctoringIncident,
} from '@/stores/useProctoringStore';

const SEVERITY_VAR: Record<ProctoringIncident['severity'], string> = {
    INFO: 'info',
    WARNING: 'warning',
    CRITICAL: 'danger',
};

const FILTERS: IncidentSeverityFilter[] = ['ALL', 'CRITICAL', 'WARNING', 'INFO'];

function humanizeType(type: string): string {
    return type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

interface IncidentFeedProps {
    incidents: ProctoringIncident[];
    activeFilter: IncidentSeverityFilter;
    onFilterChange: (f: IncidentSeverityFilter) => void;
}

export default function IncidentFeed({
    incidents,
    activeFilter,
    onFilterChange,
}: IncidentFeedProps) {
    return (
        <div className="rounded-xl border border-shell-border bg-shell-surface p-4">
            <div className="mb-3 flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Incidents</h3>
                <div className="ml-auto flex gap-1">
                    {FILTERS.map((f) => (
                        <button
                            key={f}
                            type="button"
                            onClick={() => onFilterChange(f)}
                            className={`rounded-full px-2.5 py-0.5 text-eyebrow font-semibold transition-colors focus-ring ${
                                activeFilter === f
                                    ? 'bg-brand/10 text-brand'
                                    : 'text-shell-muted-dim hover:text-foreground'
                            }`}
                        >
                            {f === 'ALL' ? 'All' : humanizeType(f)}
                        </button>
                    ))}
                </div>
            </div>

            {incidents.length === 0 ? (
                <EmptyState title="No incidents recorded" description="A clean exam so far." />
            ) : (
                <ul className="divide-y divide-shell-border">
                    {incidents.map((inc) => {
                        const varName = SEVERITY_VAR[inc.severity];
                        return (
                            <li key={inc.id} className="flex items-start gap-3 py-2.5">
                                <span
                                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: `var(--color-${varName}-fg)` }}
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground">
                                        {humanizeType(inc.incident_type)}
                                    </p>
                                    {inc.student_email && (
                                        <p className="truncate text-meta text-shell-muted">
                                            {inc.student_email}
                                        </p>
                                    )}
                                    <p className="text-meta text-shell-muted-dim">
                                        {inc.source === 'CLIENT' ? 'Reported by client' : 'Server'} ·{' '}
                                        {formatRelativeTime(inc.created_at)}
                                    </p>
                                </div>
                                <span
                                    className="shrink-0 rounded-full px-2 py-0.5 text-eyebrow font-semibold"
                                    style={{
                                        backgroundColor: `var(--color-${varName}-bg)`,
                                        color: `var(--color-${varName}-fg)`,
                                    }}
                                >
                                    {inc.severity}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

'use client';

import { Avatar, Drawer, EmptyState } from '@/components/ui';
import { formatRelativeTime } from '@/lib/relativeTime';
import type { MonitorAttempt, ProctoringIncident } from '@/stores/useProctoringStore';

const SEVERITY_VAR: Record<ProctoringIncident['severity'], string> = {
    INFO: 'info',
    WARNING: 'warning',
    CRITICAL: 'danger',
};

function humanize(type: string): string {
    return type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

interface StudentDetailDrawerProps {
    attempt: MonitorAttempt | null;
    incidents: ProctoringIncident[];
    onClose: () => void;
    onTerminate: (attempt: MonitorAttempt) => void;
}

export default function StudentDetailDrawer({
    attempt,
    incidents,
    onClose,
    onTerminate,
}: StudentDetailDrawerProps) {
    const open = attempt !== null;
    const ended = attempt ? attempt.status !== 'STARTED' : true;

    const counts = incidents.reduce(
        (acc, inc) => {
            acc[inc.severity] += 1;
            return acc;
        },
        { CRITICAL: 0, WARNING: 0, INFO: 0 } as Record<ProctoringIncident['severity'], number>,
    );

    return (
        <Drawer
            isOpen={open}
            onClose={onClose}
            widthClassName="w-[28rem] max-w-[100vw]"
            title={attempt ? 'Student detail' : ''}
            footer={
                attempt && !ended ? (
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => onTerminate(attempt)}
                            className="rounded-md border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-1.5 text-meta font-semibold text-[var(--color-danger-fg)] hover:opacity-90 focus-ring"
                        >
                            Terminate
                        </button>
                    </div>
                ) : null
            }
        >
            {attempt && (
                <div className="space-y-5">
                    {/* Identity */}
                    <div className="flex items-center gap-3">
                        <Avatar email={attempt.student_email} />
                        <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">
                                {attempt.student_name || attempt.student_email}
                            </p>
                            <p className="truncate text-meta text-shell-muted-dim">{attempt.student_email}</p>
                        </div>
                    </div>

                    {/* At-a-glance */}
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <dt className="text-eyebrow uppercase tracking-eyebrow text-shell-muted-dim">Status</dt>
                            <dd className="text-foreground">
                                {attempt.status === 'STARTED' ? 'In progress' : attempt.status}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-eyebrow uppercase tracking-eyebrow text-shell-muted-dim">Question</dt>
                            <dd className="text-foreground">{attempt.current_question_label || '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-eyebrow uppercase tracking-eyebrow text-shell-muted-dim">Last seen</dt>
                            <dd className="text-foreground">
                                {attempt.last_seen_at ? formatRelativeTime(attempt.last_seen_at) : '—'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-eyebrow uppercase tracking-eyebrow text-shell-muted-dim">Flagged</dt>
                            <dd className="text-foreground">{attempt.flagged_for_review ? 'Yes' : 'No'}</dd>
                        </div>
                    </dl>

                    {/* Severity tallies */}
                    <div className="flex gap-2">
                        {(['CRITICAL', 'WARNING', 'INFO'] as const).map((sev) => (
                            <span
                                key={sev}
                                className="rounded-full px-2.5 py-0.5 text-eyebrow font-semibold"
                                style={{
                                    backgroundColor: `var(--color-${SEVERITY_VAR[sev]}-bg)`,
                                    color: `var(--color-${SEVERITY_VAR[sev]}-fg)`,
                                }}
                            >
                                {counts[sev]} {sev.toLowerCase()}
                            </span>
                        ))}
                    </div>

                    {/* Incident list */}
                    <div>
                        <h4 className="mb-2 text-sm font-semibold text-foreground">Warnings &amp; incidents</h4>
                        {incidents.length === 0 ? (
                            <EmptyState title="No incidents" description="This student has a clean record so far." />
                        ) : (
                            <ul className="divide-y divide-shell-border">
                                {incidents.map((inc) => {
                                    const v = SEVERITY_VAR[inc.severity];
                                    return (
                                        <li key={inc.id} className="flex items-start gap-3 py-2.5">
                                            <span
                                                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                                                style={{ backgroundColor: `var(--color-${v}-fg)` }}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-foreground">
                                                    {humanize(inc.incident_type)}
                                                </p>
                                                <p className="text-meta text-shell-muted-dim">
                                                    {inc.source === 'CLIENT' ? 'Reported by client' : 'Server'} ·{' '}
                                                    {formatRelativeTime(inc.created_at)}
                                                </p>
                                            </div>
                                            <span
                                                className="shrink-0 rounded-full px-2 py-0.5 text-eyebrow font-semibold"
                                                style={{
                                                    backgroundColor: `var(--color-${v}-bg)`,
                                                    color: `var(--color-${v}-fg)`,
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
                </div>
            )}
        </Drawer>
    );
}

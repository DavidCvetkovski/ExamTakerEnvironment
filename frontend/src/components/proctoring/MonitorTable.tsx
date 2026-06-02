'use client';

import { Avatar, EmptyState, RowActionMenu } from '@/components/ui';
import { formatRelativeTime } from '@/lib/relativeTime';
import type { MonitorAttempt, PresenceState } from '@/stores/useProctoringStore';

const PRESENCE_META: Record<PresenceState, { label: string; varName: string }> = {
    ACTIVE: { label: 'Active', varName: 'presence-active' },
    IDLE: { label: 'Idle', varName: 'presence-idle' },
    DISCONNECTED: { label: 'Disconnected', varName: 'presence-disconnected' },
};

function PresenceBadge({ presence }: { presence: PresenceState }) {
    const meta = PRESENCE_META[presence];
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-meta font-medium"
            style={{
                backgroundColor: `var(--color-${meta.varName}-bg)`,
                color: `var(--color-${meta.varName}-fg)`,
            }}
        >
            <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: `var(--color-${meta.varName})` }}
            />
            {meta.label}
        </span>
    );
}

interface MonitorTableProps {
    attempts: MonitorAttempt[];
    onExtend: (sessionId: string, minutes: number) => void;
    onPause: (sessionId: string) => void;
    onResume: (sessionId: string) => void;
    onTerminate: (attempt: MonitorAttempt) => void;
}

export default function MonitorTable({
    attempts,
    onExtend,
    onPause,
    onResume,
    onTerminate,
}: MonitorTableProps) {
    if (attempts.length === 0) {
        return (
            <EmptyState
                title="No active attempts"
                description="Students will appear here once they join this exam."
            />
        );
    }

    return (
        <div className="overflow-x-auto rounded-xl border border-shell-border">
            <table className="min-w-full text-left text-sm">
                <thead className="text-eyebrow uppercase tracking-eyebrow text-shell-muted-dim">
                    <tr className="border-b border-shell-border">
                        <th className="px-4 py-3">Student</th>
                        <th className="px-4 py-3">Presence</th>
                        <th className="px-4 py-3">Question</th>
                        <th className="px-4 py-3">Last seen</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Incidents</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {attempts.map((a) => {
                        const ended = a.status !== 'STARTED';
                        return (
                            <tr key={a.exam_session_id} className="border-b border-shell-border last:border-0">
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <Avatar email={a.student_email} />
                                        <div>
                                            <p className="font-medium text-foreground">
                                                {a.student_name || a.student_email}
                                            </p>
                                            {a.flagged_for_review && (
                                                <span className="text-eyebrow font-semibold text-[var(--color-danger-fg)]">
                                                    Flagged for review
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <PresenceBadge presence={a.presence} />
                                </td>
                                <td className="px-4 py-3 tabular-nums text-shell-muted">
                                    {a.current_question_label || '—'}
                                </td>
                                <td className="px-4 py-3 text-shell-muted-dim">
                                    {a.last_seen_at ? formatRelativeTime(a.last_seen_at) : '—'}
                                </td>
                                <td className="px-4 py-3 text-shell-muted">
                                    {a.is_paused ? 'Paused' : a.status === 'STARTED' ? 'In progress' : a.status}
                                </td>
                                <td className="px-4 py-3 tabular-nums">
                                    {a.incident_count > 0 ? (
                                        <span className="font-semibold text-[var(--color-warning-fg)]">
                                            {a.incident_count}
                                        </span>
                                    ) : (
                                        <span className="text-shell-muted-dim">0</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <RowActionMenu
                                        ariaLabel={`Actions for ${a.student_email}`}
                                        items={[
                                            { label: 'Extend +5 min', onClick: () => onExtend(a.exam_session_id, 5), disabled: ended },
                                            { label: 'Extend +15 min', onClick: () => onExtend(a.exam_session_id, 15), disabled: ended },
                                            a.is_paused
                                                ? { label: 'Resume', onClick: () => onResume(a.exam_session_id), disabled: ended }
                                                : { label: 'Pause', onClick: () => onPause(a.exam_session_id), disabled: ended },
                                            { label: 'Terminate…', onClick: () => onTerminate(a), tone: 'danger', disabled: ended },
                                        ]}
                                    />
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

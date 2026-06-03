'use client';

import { useMemo, useState } from 'react';
import { Avatar, EmptyState, RowActionMenu } from '@/components/ui';
import { formatRelativeTime } from '@/lib/relativeTime';
import type { MonitorAttempt, PresenceState } from '@/stores/useProctoringStore';

const PRESENCE_META: Record<PresenceState, { label: string; varName: string; rank: number }> = {
    ACTIVE: { label: 'Active', varName: 'presence-active', rank: 0 },
    IDLE: { label: 'Idle', varName: 'presence-idle', rank: 1 },
    DISCONNECTED: { label: 'Disconnected', varName: 'presence-disconnected', rank: 2 },
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

type SortKey = 'student' | 'presence' | 'question' | 'last_seen' | 'incidents';

function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
    // §7.8: render only ↑ / ↓. Inactive columns show a muted ↑ (no ↕ glyph).
    return (
        <span className={active ? 'text-foreground' : 'text-shell-muted-dim'} aria-hidden="true">
            {active && dir === 'desc' ? '↓' : '↑'}
        </span>
    );
}

interface MonitorTableProps {
    attempts: MonitorAttempt[];
    onExtend: (sessionId: string, minutes: number) => void;
    onTerminate: (attempt: MonitorAttempt) => void;
    onSelectStudent: (attempt: MonitorAttempt) => void;
}

export default function MonitorTable({
    attempts,
    onExtend,
    onTerminate,
    onSelectStudent,
}: MonitorTableProps) {
    const [sortKey, setSortKey] = useState<SortKey>('student');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    const toggleSort = (key: SortKey) => {
        if (key === sortKey) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const sorted = useMemo(() => {
        const value = (a: MonitorAttempt): number | string => {
            switch (sortKey) {
                case 'student':
                    return (a.student_name || a.student_email).toLowerCase();
                case 'presence':
                    return PRESENCE_META[a.presence].rank;
                case 'question':
                    return a.current_question_index ?? -1;
                case 'last_seen':
                    return a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
                case 'incidents':
                    return a.incident_count;
            }
        };
        const rows = [...attempts].sort((a, b) => {
            const va = value(a);
            const vb = value(b);
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return rows;
    }, [attempts, sortKey, sortDir]);

    if (attempts.length === 0) {
        return (
            <EmptyState
                title="No active attempts"
                description="Students will appear here once they join this exam."
            />
        );
    }

    const header = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => (
        <th className={`px-4 py-3 ${align === 'right' ? 'text-right' : ''}`}>
            <button
                type="button"
                onClick={() => toggleSort(key)}
                className="inline-flex items-center gap-1 uppercase tracking-eyebrow text-eyebrow font-semibold text-shell-muted-dim hover:text-foreground focus-ring rounded-sm"
            >
                {label}
                <SortArrow active={sortKey === key} dir={sortDir} />
            </button>
        </th>
    );

    return (
        <div className="overflow-x-auto rounded-xl border border-shell-border">
            <table className="min-w-full text-left text-sm">
                <thead>
                    <tr className="border-b border-shell-border">
                        {header('student', 'Student')}
                        {header('presence', 'Presence')}
                        {header('question', 'Question')}
                        {header('last_seen', 'Last seen')}
                        <th className="px-4 py-3 text-eyebrow uppercase tracking-eyebrow text-shell-muted-dim">Status</th>
                        {header('incidents', 'Incidents')}
                        <th className="px-4 py-3 text-right text-eyebrow uppercase tracking-eyebrow text-shell-muted-dim">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((a) => {
                        const ended = a.status !== 'STARTED';
                        return (
                            <tr
                                key={a.exam_session_id}
                                onClick={() => onSelectStudent(a)}
                                className="cursor-pointer border-b border-shell-border last:border-0 hover:bg-shell-input/40"
                            >
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
                                    {a.status === 'STARTED' ? 'In progress' : a.status}
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
                                <td
                                    className="px-4 py-3 text-right"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <RowActionMenu
                                        ariaLabel={`Actions for ${a.student_email}`}
                                        items={[
                                            { label: 'View details', onClick: () => onSelectStudent(a) },
                                            { label: 'Extend +5 min', onClick: () => onExtend(a.exam_session_id, 5), disabled: ended },
                                            { label: 'Extend +15 min', onClick: () => onExtend(a.exam_session_id, 15), disabled: ended },
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

'use client';

import { useState } from 'react';
import type { ScheduledSession } from '@/stores/useSessionManagerStore';
import { Button, Badge, EmptyState } from '@/components/ui';
import { useCountdown } from '@/hooks/useCountdown';
import { formatScheduled, formatAbsolute, formatRelativeTime } from '@/lib/relativeTime';

interface ScheduledSessionsTableProps {
    sessions: ScheduledSession[];
    isBusy: boolean;
    onRequestCancel: (sessionId: string) => void;
    onPractice: (testDefinitionId: string) => Promise<void>;
    onManageEnrollments: (courseId: string) => void;
}

function SessionRow({
    session,
    isBusy,
    onRequestCancel,
    onPractice,
    onManageEnrollments,
    countdownTarget,
    countdownLabel,
    countdownTone,
}: {
    session: ScheduledSession;
    isBusy: boolean;
    onRequestCancel: (id: string) => void;
    onPractice: (testDefinitionId: string) => Promise<void>;
    onManageEnrollments: (courseId: string) => void;
    countdownTarget?: string;
    countdownLabel?: string;
    countdownTone?: string;
}) {
    const countdown = useCountdown(countdownTarget ?? session.starts_at);
    const canCancel = session.status !== 'CLOSED' && session.status !== 'CANCELED';

    return (
        <tr className="border-t border-shell-border">
            <td className="py-4 pr-4">
                <p className="font-semibold text-foreground">{session.course_code}</p>
                <p className="text-shell-muted-dim text-xs">{session.course_title}</p>
            </td>
            <td className="py-4 pr-4 text-foreground">{session.test_title}</td>
            <td className="py-4 pr-4 text-shell-muted text-sm" title={formatAbsolute(session.starts_at)}>
                {new Date(session.starts_at) > new Date()
                    ? formatScheduled(session.starts_at)
                    : formatRelativeTime(session.starts_at)}
            </td>
            <td className="py-4 pr-4 text-shell-muted-dim text-sm" title={formatAbsolute(session.ends_at)}>
                {new Date(session.ends_at) > new Date()
                    ? formatScheduled(session.ends_at)
                    : formatRelativeTime(session.ends_at)}
            </td>
            {countdownTarget && (
                <td className="py-4 pr-4 text-sm tabular-nums" style={{ color: countdownTone }}>
                    {countdownLabel} {countdown}
                </td>
            )}
            <td className="py-4">
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onManageEnrollments(session.course_id)}
                    >
                        Enrollments
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onPractice(session.test_definition_id)}
                    >
                        Practice
                    </Button>
                    {canCancel && (
                        <Button
                            variant="destructive"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => onRequestCancel(session.id)}
                        >
                            Cancel
                        </Button>
                    )}
                </div>
            </td>
        </tr>
    );
}

function SessionTable({
    sessions,
    isBusy,
    onRequestCancel,
    onPractice,
    onManageEnrollments,
    showCountdown,
    countdownField,
    countdownLabel,
    countdownTone,
}: {
    sessions: ScheduledSession[];
    isBusy: boolean;
    onRequestCancel: (id: string) => void;
    onPractice: (testDefinitionId: string) => Promise<void>;
    onManageEnrollments: (courseId: string) => void;
    showCountdown?: boolean;
    countdownField?: 'starts_at' | 'ends_at';
    countdownLabel?: string;
    countdownTone?: string;
}) {
    if (sessions.length === 0) return null;
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-medium text-shell-muted-dim">
                    <tr>
                        <th className="pb-3 pr-4">Course</th>
                        <th className="pb-3 pr-4">Blueprint</th>
                        <th className="pb-3 pr-4">Starts</th>
                        <th className="pb-3 pr-4">Ends</th>
                        {showCountdown && <th className="pb-3 pr-4">Time</th>}
                        <th className="pb-3">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {sessions.map((session) => (
                        <SessionRow
                            key={session.id}
                            session={session}
                            isBusy={isBusy}
                            onRequestCancel={onRequestCancel}
                            onPractice={onPractice}
                            onManageEnrollments={onManageEnrollments}
                            countdownTarget={showCountdown && countdownField ? session[countdownField] : undefined}
                            countdownLabel={countdownLabel}
                            countdownTone={countdownTone}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function ScheduledSessionsTable({
    sessions,
    isBusy,
    onRequestCancel,
    onPractice,
    onManageEnrollments,
}: ScheduledSessionsTableProps) {
    const [showCompleted, setShowCompleted] = useState(false);
    const now = new Date();

    const ongoing = sessions.filter((s) => s.status === 'ACTIVE');
    const scheduled = sessions.filter(
        (s) => s.status === 'SCHEDULED' && new Date(s.starts_at) > now
    );
    const completed = sessions.filter(
        (s) =>
            s.status === 'CLOSED' ||
            s.status === 'CANCELED' ||
            (s.status === 'SCHEDULED' && new Date(s.ends_at) <= now)
    );

    if (sessions.length === 0) {
        return (
            <EmptyState
                title="No scheduled sessions yet"
                description="Schedule one using the form above."
            />
        );
    }

    return (
        <div className="space-y-6">
            {/* Ongoing */}
            {ongoing.length > 0 && (
                <div className="rounded-2xl border border-shell-border bg-shell-panel-a p-6">
                    <div className="mb-4 flex items-center gap-3">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-success-fg)]" />
                        <h3 className="text-lg font-semibold text-foreground">Ongoing</h3>
                        <Badge tone="success" size="sm">{ongoing.length}</Badge>
                    </div>
                    <SessionTable
                        sessions={ongoing}
                        isBusy={isBusy}
                        onRequestCancel={onRequestCancel}
                        onPractice={onPractice}
                        onManageEnrollments={onManageEnrollments}
                        showCountdown
                        countdownField="ends_at"
                        countdownLabel="Ends in"
                        countdownTone="var(--color-warning-fg)"
                    />
                </div>
            )}

            {/* Scheduled */}
            {scheduled.length > 0 && (
                <div className="rounded-2xl border border-shell-border bg-shell-panel-a p-6">
                    <div className="mb-4 flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-foreground">Scheduled</h3>
                        <Badge tone="info" size="sm">{scheduled.length}</Badge>
                    </div>
                    <SessionTable
                        sessions={scheduled}
                        isBusy={isBusy}
                        onRequestCancel={onRequestCancel}
                        onPractice={onPractice}
                        onManageEnrollments={onManageEnrollments}
                        showCountdown
                        countdownField="starts_at"
                        countdownLabel="Starts in"
                        countdownTone="var(--color-info-fg)"
                    />
                </div>
            )}

            {/* Completed */}
            {completed.length > 0 && (
                <div className="rounded-2xl border border-shell-border bg-shell-panel-a p-6">
                    <button
                        type="button"
                        onClick={() => setShowCompleted((v) => !v)}
                        className="flex w-full items-center gap-3 text-left"
                        aria-expanded={showCompleted}
                    >
                        <h3 className="text-lg font-semibold text-shell-muted">Completed</h3>
                        <Badge tone="neutral" size="sm">{completed.length}</Badge>
                        <span className="ml-auto text-sm text-shell-muted-dim">{showCompleted ? 'Hide' : 'Show'}</span>
                    </button>
                    {showCompleted && (
                        <div className="mt-4">
                            <SessionTable
                                sessions={completed}
                                isBusy={isBusy}
                                onRequestCancel={onRequestCancel}
                                onPractice={onPractice}
                                onManageEnrollments={onManageEnrollments}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

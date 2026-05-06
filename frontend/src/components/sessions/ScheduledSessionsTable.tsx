'use client';

import { useState } from 'react';
import type { ScheduledSession } from '@/stores/useSessionManagerStore';
import { Button, Badge } from '@/components/ui';
import { useCountdown } from '@/hooks/useCountdown';

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
            <td className="py-4 pr-4 text-shell-muted text-sm">{new Date(session.starts_at).toLocaleString()}</td>
            <td className="py-4 pr-4 text-shell-muted-dim text-sm">{new Date(session.ends_at).toLocaleString()}</td>
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
    const [showPast, setShowPast] = useState(false);
    const now = new Date();

    const ongoing = sessions.filter((s) => s.status === 'ACTIVE');
    const planned = sessions.filter(
        (s) => s.status === 'SCHEDULED' && new Date(s.starts_at) > now
    );
    const past = sessions.filter(
        (s) =>
            s.status === 'CLOSED' ||
            s.status === 'CANCELED' ||
            (s.status === 'SCHEDULED' && new Date(s.ends_at) <= now)
    );

    if (sessions.length === 0) {
        return (
            <div className="rounded-card-md border border-shell-border bg-shell-panel-a p-6">
                <div className="rounded-card border border-dashed border-shell-border bg-shell-surface/30 px-6 py-10 text-center text-sm text-shell-muted-dim">
                    No scheduled sessions yet.
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Ongoing */}
            {ongoing.length > 0 && (
                <div className="rounded-card-md border border-shell-border bg-shell-panel-a p-6">
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

            {/* Planned */}
            {planned.length > 0 && (
                <div className="rounded-card-md border border-shell-border bg-shell-panel-a p-6">
                    <div className="mb-4 flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-foreground">Planned</h3>
                        <Badge tone="info" size="sm">{planned.length}</Badge>
                    </div>
                    <SessionTable
                        sessions={planned}
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

            {/* Past */}
            {past.length > 0 && (
                <div className="rounded-card-md border border-shell-border bg-shell-panel-a p-6">
                    <button
                        type="button"
                        onClick={() => setShowPast((v) => !v)}
                        className="flex w-full items-center gap-3 text-left"
                    >
                        <h3 className="text-lg font-semibold text-shell-muted">Past sessions</h3>
                        <Badge tone="neutral" size="sm">{past.length}</Badge>
                        <span className="ml-auto text-sm text-shell-muted-dim">{showPast ? '▲ Hide' : '▼ Show'}</span>
                    </button>
                    {showPast && (
                        <div className="mt-4">
                            <SessionTable
                                sessions={past}
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

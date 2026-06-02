'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ScheduledSession } from '@/stores/useSessionManagerStore';
import { useSessionManagerStore } from '@/stores/useSessionManagerStore';
import { Button, Badge, EmptyState, RowActionMenu, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { useCountdown } from '@/hooks/useCountdown';
import { useLifecycleSync } from '@/hooks/useLifecycleSync';
import { useServerNow } from '@/hooks/useServerNow';
import { deriveScheduledStatus } from '@/lib/sessionLifecycle';
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
    showCopyId,
    showMonitor,
}: {
    session: ScheduledSession;
    isBusy: boolean;
    onRequestCancel: (id: string) => void;
    onPractice: (testDefinitionId: string) => Promise<void>;
    onManageEnrollments: (courseId: string) => void;
    countdownTarget?: string;
    countdownLabel?: string;
    countdownTone?: string;
    showCopyId?: boolean;
    showMonitor?: boolean;
}) {
    const { display: countdown } = useCountdown(countdownTarget ?? session.starts_at);
    const now = useServerNow(60_000);
    const { toast } = useToast();
    const router = useRouter();
    const canCancel = session.status !== 'CLOSED' && session.status !== 'CANCELED';

    const copyId = async () => {
        const ok = await copyText(session.id);
        toast(ok ? { tone: 'success', title: 'Session ID copied' } : { tone: 'danger', title: 'Copy failed' });
    };

    const downloadSeb = async () => {
        try {
            const res = await api.get(`scheduled-sessions/${session.id}/seb-config`, {
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.download = `exam-${session.id}.seb`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast({ tone: 'success', title: 'SEB config downloaded' });
        } catch {
            toast({ tone: 'danger', title: 'Could not download SEB config' });
        }
    };

    const menuItems = [
        ...(showMonitor ? [{ label: 'Download SEB config', onClick: downloadSeb }] : []),
        ...(showCopyId ? [{ label: 'Copy session ID', onClick: copyId }] : []),
    ];

    return (
        <tr className="border-t border-shell-border">
            <td className="py-4 pr-4">
                <p className="font-semibold text-foreground" title={session.course_code}>
                    {session.course_title}
                </p>
            </td>
            <td className="py-4 pr-4 text-foreground">{session.test_title}</td>
            <td className="py-4 pr-4 text-shell-muted text-sm" title={formatAbsolute(session.starts_at)}>
                {new Date(session.starts_at) > now
                    ? formatScheduled(session.starts_at)
                    : formatRelativeTime(session.starts_at)}
            </td>
            <td className="py-4 pr-4 text-shell-muted-dim text-sm" title={formatAbsolute(session.ends_at)}>
                {new Date(session.ends_at) > now
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
                    {showMonitor && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => router.push(`/sessions/${session.id}/monitor`)}
                        >
                            Monitor
                        </Button>
                    )}
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
                    {menuItems.length > 0 && (
                        <RowActionMenu ariaLabel="Session actions" items={menuItems} />
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
    startsHeader,
    showCopyId,
    showMonitor,
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
    /** Column-header tense for the start timestamp. Ongoing/completed
     * sessions have already started, so the header reads "Started"; for
     * future-scheduled rows it stays "Starts". */
    startsHeader?: 'Starts' | 'Started';
    /** Show a row overflow menu to copy the session id (completed rows). */
    showCopyId?: boolean;
    /** Show the live-monitor entry point + SEB download (ongoing rows). */
    showMonitor?: boolean;
}) {
    if (sessions.length === 0) return null;
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-medium text-shell-muted-dim">
                    <tr>
                        <th className="pb-3 pr-4">Course</th>
                        <th className="pb-3 pr-4">Blueprint</th>
                        <th className="pb-3 pr-4">{startsHeader ?? 'Starts'}</th>
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
                            showCopyId={showCopyId}
                            showMonitor={showMonitor}
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
    const fetchScheduledSessions = useSessionManagerStore((s) => s.fetchScheduledSessions);

    // Epoch 8.6 Stage 1 — reactive lifecycle.
    // `useServerNow(1000)` re-renders every second with skew-corrected time so
    // bucket placement flips the moment `starts_at`/`ends_at` is crossed.
    // `useLifecycleSync` schedules a precise refetch at the next transition
    // (plus a 60s safety heartbeat) so the DB row is in sync with the UI.
    const now = useServerNow(1000);
    useLifecycleSync(sessions, fetchScheduledSessions);

    const ongoing = sessions.filter((s) => deriveScheduledStatus(s, now) === 'ACTIVE');
    const scheduled = sessions.filter((s) => deriveScheduledStatus(s, now) === 'SCHEDULED');
    const completed = sessions.filter((s) => {
        const e = deriveScheduledStatus(s, now);
        return e === 'CLOSED' || e === 'CANCELED';
    });

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
                        startsHeader="Started"
                        showMonitor
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
                                startsHeader="Started"
                                showCopyId
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

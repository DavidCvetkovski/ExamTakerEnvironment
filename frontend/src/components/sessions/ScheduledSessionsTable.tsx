'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ScheduledSession } from '@/stores/useSessionManagerStore';
import { useSessionManagerStore } from '@/stores/useSessionManagerStore';
import { Badge, EmptyState, RowActionMenu, useToast } from '@/components/ui';
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
    showReview,
    showSebDownload,
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
    showReview?: boolean;
    /** L-9: show the SEB download for SCHEDULED rows too (independent of showMonitor). */
    showSebDownload?: boolean;
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

    // Epoch 14.6 — every per-row control lives in the overflow menu. The order
    // is deliberate: the navigational primary (Monitor while live, Review once
    // closed) first, then management actions, then the destructive Cancel last.
    const menuItems = [
        ...(showMonitor
            ? [{ label: 'Monitor', onClick: () => router.push(`/sessions/${session.id}/monitor`) }]
            : []),
        // Epoch 14.7 — a closed session's recorded proctoring data stays
        // reachable through the same page, relabelled "Review".
        // M-3: only show "Review proctoring" when the test was actually proctored.
        ...(showReview && session.has_proctoring
            ? [{ label: 'Review proctoring', onClick: () => router.push(`/sessions/${session.id}/monitor?mode=review`) }]
            : []),
        { label: 'Manage enrollments', onClick: () => onManageEnrollments(session.course_id) },
        { label: 'Practice', onClick: () => { void onPractice(session.test_definition_id); } },
        // L-9: SEB config is available for SCHEDULED and ACTIVE sessions.
        ...(showMonitor || showSebDownload ? [{ label: 'Get exam launcher file', onClick: downloadSeb }] : []),
        ...(showCopyId ? [{ label: 'Copy session ID', onClick: copyId }] : []),
        ...(canCancel
            ? [{ label: 'Cancel session', tone: 'danger' as const, onClick: () => onRequestCancel(session.id), disabled: isBusy }]
            : []),
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
                <div className="flex justify-end">
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
    showReview,
    showSebDownload,
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
    startsHeader?: 'Starts' | 'Started';
    showCopyId?: boolean;
    showMonitor?: boolean;
    showReview?: boolean;
    showSebDownload?: boolean;
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
                            showReview={showReview}
                            showSebDownload={showSebDownload}
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
    // L-6: auto-expand the completed bucket when it is the only non-empty one
    // so a constructor whose first session just closed doesn't see a blank page.
    // useState takes an initialiser fn — buckets aren't known yet, but we can
    // seed from the passed sessions directly since they're available in scope.
    const [showCompleted, setShowCompleted] = useState(() => {
        const now = new Date();
        const hasOngoing = sessions.some((s) => deriveScheduledStatus(s, now) === 'ACTIVE');
        const hasScheduled = sessions.some((s) => deriveScheduledStatus(s, now) === 'SCHEDULED');
        return !hasOngoing && !hasScheduled;
    });
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
                        showSebDownload
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
                                showReview
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

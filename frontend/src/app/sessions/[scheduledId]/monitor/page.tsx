'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import PageShell from '@/components/layout/PageShell';
import { BackButton, Button, PageHeader, useConfirm, useToast } from '@/components/ui';
import { downloadFile } from '@/lib/download';
import IncidentFeed from '@/components/proctoring/IncidentFeed';
import MonitorTable from '@/components/proctoring/MonitorTable';
import StudentDetailDrawer from '@/components/proctoring/StudentDetailDrawer';
import { useProctoringStore, type MonitorAttempt } from '@/stores/useProctoringStore';
import { useCountdown } from '@/hooks/useCountdown';

const MONITOR_POLL_MS = 5000;
const INCIDENT_POLL_MS = 10000;

export default function MonitorPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const scheduledId = params.scheduledId as string;
    const isReview = searchParams.get('mode') === 'review';
    const { toast } = useToast();
    const { confirm, ConfirmDialog } = useConfirm();

    const downloadLog = async () => {
        try {
            await downloadFile(
                `scheduled-sessions/${scheduledId}/incidents/export`,
                `proctoring-log-${scheduledId}.csv`,
            );
            toast({ tone: 'success', title: 'Log downloaded' });
        } catch {
            toast({ tone: 'danger', title: 'Could not download log' });
        }
    };

    const {
        attempts,
        incidents,
        studentIncidents,
        severityFilter,
        sessionMeta,
        fetchMonitor,
        fetchIncidents,
        fetchStudentIncidents,
        setSeverityFilter,
        terminate,
    } = useProctoringStore();

    // S-1: countdown to session end visible in the header.
    const { display: timeToEnd } = useCountdown(sessionMeta?.ends_at ?? new Date(0).toISOString());

    // L-7: auto-transition to review once all attempts are done and window has closed.
    useEffect(() => {
        if (isReview) return;
        if (!sessionMeta?.ends_at) return;
        const allDone = attempts.length > 0 && attempts.every((a) => a.status !== 'STARTED');
        const windowClosed = new Date(sessionMeta.ends_at) <= new Date();
        if (allDone && windowClosed) {
            router.replace(`/sessions/${scheduledId}/monitor?mode=review`);
        }
    }, [isReview, attempts, sessionMeta, scheduledId, router]);

    // The attempt opened in the detail drawer.
    const [selected, setSelected] = useState<MonitorAttempt | null>(null);

    const refreshMonitor = useCallback(() => fetchMonitor(scheduledId), [fetchMonitor, scheduledId]);
    const refreshIncidents = useCallback(
        () => fetchIncidents(scheduledId),
        [fetchIncidents, scheduledId],
    );

    // Poll both feeds; pause polling while the tab is hidden to avoid waste.
    const monitorTimer = useRef<ReturnType<typeof setInterval> | null>(null);
    const incidentTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        refreshMonitor();
        refreshIncidents();

        // A closed session's data is static — fetch once, don't poll (Epoch 14.7).
        if (isReview) return;

        const start = () => {
            monitorTimer.current = setInterval(refreshMonitor, MONITOR_POLL_MS);
            incidentTimer.current = setInterval(refreshIncidents, INCIDENT_POLL_MS);
        };
        const stop = () => {
            if (monitorTimer.current) clearInterval(monitorTimer.current);
            if (incidentTimer.current) clearInterval(incidentTimer.current);
        };
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                stop();
            } else {
                refreshMonitor();
                refreshIncidents();
                stop();
                start();
            }
        };

        start();
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            stop();
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [refreshMonitor, refreshIncidents, isReview]);

    // Re-fetch incidents when the severity filter changes.
    useEffect(() => {
        refreshIncidents();
    }, [severityFilter, refreshIncidents]);

    const withRefresh = async (action: Promise<unknown>, success: string) => {
        try {
            await action;
            toast({ tone: 'success', title: success });
            await refreshMonitor();
        } catch (err: unknown) {
            const message =
                (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                'Action failed';
            toast({ tone: 'danger', title: message });
        }
    };

    const openStudent = useCallback(
        (attempt: MonitorAttempt) => {
            setSelected(attempt);
            void fetchStudentIncidents(scheduledId, attempt.exam_session_id);
        },
        [fetchStudentIncidents, scheduledId],
    );

    // Keep the open drawer's incidents fresh while it stays open.
    useEffect(() => {
        if (!selected) return;
        const interval = setInterval(() => {
            void fetchStudentIncidents(scheduledId, selected.exam_session_id);
        }, INCIDENT_POLL_MS);
        return () => clearInterval(interval);
    }, [selected, fetchStudentIncidents, scheduledId]);

    // Show the live row for the selected student so the drawer reflects polls.
    const selectedLive =
        selected != null
            ? attempts.find((a) => a.exam_session_id === selected.exam_session_id) ?? selected
            : null;

    const handleTerminate = async (attempt: MonitorAttempt) => {
        const ok = await confirm({
            title: 'Terminate this attempt?',
            message:
                'This force-submits the student’s exam for grading and cannot be undone.',
            confirmLabel: 'Yes, terminate',
            tone: 'danger',
        });
        if (!ok) return;
        await withRefresh(terminate(attempt.exam_session_id), 'Attempt terminated');
    };

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <PageShell width="wide">
                <BackButton href="/sessions" label="Back to sessions" />
                {/* M-1: include course + test name so a supervisor with multiple tabs can
                    identify the session at a glance. S-1: countdown to window close. */}
                <PageHeader
                    title={isReview ? 'Exam review' : 'Exam monitor'}
                    subtitle={
                        sessionMeta
                            ? `${sessionMeta.course_code} · ${sessionMeta.test_title}`
                            : isReview
                            ? 'Recorded proctoring data from this closed exam window.'
                            : 'Live status of every attempt in this exam window.'
                    }
                    actions={
                        <div className="flex items-center gap-3">
                            {!isReview && timeToEnd && (
                                <span className="text-sm font-medium text-shell-muted tabular-nums">
                                    Closes in {timeToEnd}
                                </span>
                            )}
                            <Button variant="secondary" size="md" onClick={downloadLog}>
                                Download log
                            </Button>
                        </div>
                    }
                />

                <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                        <MonitorTable
                            attempts={attempts}
                            onTerminate={handleTerminate}
                            onSelectStudent={openStudent}
                        />
                    </div>
                    <div>
                        <IncidentFeed
                            incidents={incidents}
                            activeFilter={severityFilter}
                            onFilterChange={setSeverityFilter}
                        />
                    </div>
                </div>
            </PageShell>
            <StudentDetailDrawer
                attempt={selectedLive}
                incidents={studentIncidents}
                onClose={() => setSelected(null)}
                onTerminate={handleTerminate}
            />
            {ConfirmDialog}
        </ProtectedRoute>
    );
}

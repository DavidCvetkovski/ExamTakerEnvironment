'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import PageShell from '@/components/layout/PageShell';
import { BackButton, PageHeader, useConfirm, useToast } from '@/components/ui';
import IncidentFeed from '@/components/proctoring/IncidentFeed';
import MonitorTable from '@/components/proctoring/MonitorTable';
import StudentDetailDrawer from '@/components/proctoring/StudentDetailDrawer';
import { useProctoringStore, type MonitorAttempt } from '@/stores/useProctoringStore';

const MONITOR_POLL_MS = 5000;
const INCIDENT_POLL_MS = 10000;

export default function MonitorPage() {
    const params = useParams();
    const scheduledId = params.scheduledId as string;
    const { toast } = useToast();
    const { confirm, ConfirmDialog } = useConfirm();

    const {
        attempts,
        incidents,
        studentIncidents,
        severityFilter,
        fetchMonitor,
        fetchIncidents,
        fetchStudentIncidents,
        setSeverityFilter,
        extend,
        terminate,
    } = useProctoringStore();

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
    }, [refreshMonitor, refreshIncidents]);

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
                <PageHeader
                    title="Exam monitor"
                    subtitle="Live status of every attempt in this exam window."
                />

                <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                        <MonitorTable
                            attempts={attempts}
                            onExtend={(id, minutes) =>
                                withRefresh(extend(id, minutes), `Extended by ${minutes} min`)
                            }
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
                onExtend={(id, minutes) =>
                    withRefresh(extend(id, minutes), `Extended by ${minutes} min`)
                }
                onTerminate={handleTerminate}
            />
            {ConfirmDialog}
        </ProtectedRoute>
    );
}

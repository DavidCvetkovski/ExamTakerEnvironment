import { create } from 'zustand';

import { api } from '@/lib/api';

export type PresenceState = 'ACTIVE' | 'IDLE' | 'DISCONNECTED';

export interface MonitorAttempt {
    exam_session_id: string;
    student_id: string;
    student_email: string;
    student_name?: string | null;
    status: 'STARTED' | 'SUBMITTED' | 'EXPIRED';
    current_question_index?: number | null;
    current_question_label?: string | null;
    last_seen_at?: string | null;
    presence: PresenceState;
    flagged_for_review: boolean;
    incident_count: number;
    /** S-2: accommodation time multiplier (null = no accommodation). */
    time_multiplier?: number | null;
}

export interface ProctoringIncident {
    id: string;
    incident_type: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    source: 'SERVER' | 'CLIENT';
    detail: Record<string, unknown>;
    created_at: string;
    student_id?: string | null;
    student_email?: string | null;
    exam_session_id?: string | null;
}

export type IncidentSeverityFilter = 'ALL' | 'INFO' | 'WARNING' | 'CRITICAL';

interface MonitorEnvelope {
    scheduled_session_id: string;
    server_now: string;
    total: number;
    page: number;
    page_size: number;
    attempts: MonitorAttempt[];
    // M-1 / S-1: session context fields added to the monitor response.
    course_code: string | null;
    course_title: string | null;
    test_title: string | null;
    ends_at: string | null;
}

export interface MonitorMeta {
    course_code: string | null;
    course_title: string | null;
    test_title: string | null;
    ends_at: string | null;
}

interface IncidentEnvelope {
    server_now: string;
    total: number;
    page: number;
    page_size: number;
    incidents: ProctoringIncident[];
}

function errorMessage(err: unknown, fallback: string): string {
    return (
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback
    );
}

interface ProctoringState {
    attempts: MonitorAttempt[];
    incidents: ProctoringIncident[];
    /** Incidents scoped to the student opened in the detail drawer. */
    studentIncidents: ProctoringIncident[];
    serverNow: string | null;
    /** M-1 / S-1: context about the session being monitored. */
    sessionMeta: MonitorMeta | null;
    isLoading: boolean;
    error: string | null;
    severityFilter: IncidentSeverityFilter;

    fetchMonitor: (scheduledId: string) => Promise<void>;
    fetchIncidents: (scheduledId: string) => Promise<void>;
    fetchStudentIncidents: (scheduledId: string, examSessionId: string) => Promise<void>;
    setSeverityFilter: (f: IncidentSeverityFilter) => void;

    terminate: (sessionId: string) => Promise<void>;
}

export const useProctoringStore = create<ProctoringState>((set, get) => ({
    attempts: [],
    incidents: [],
    studentIncidents: [],
    serverNow: null,
    sessionMeta: null,
    isLoading: false,
    error: null,
    severityFilter: 'ALL',

    fetchMonitor: async (scheduledId) => {
        try {
            const res = await api.get<MonitorEnvelope>(
                `scheduled-sessions/${scheduledId}/monitor`,
            );
            set({
                attempts: res.data.attempts,
                serverNow: res.data.server_now,
                sessionMeta: {
                    course_code: res.data.course_code,
                    course_title: res.data.course_title,
                    test_title: res.data.test_title,
                    ends_at: res.data.ends_at,
                },
                error: null,
            });
        } catch (err: unknown) {
            set({ error: errorMessage(err, 'Failed to load monitor') });
        }
    },

    fetchIncidents: async (scheduledId) => {
        const { severityFilter } = get();
        try {
            const res = await api.get<IncidentEnvelope>(
                `scheduled-sessions/${scheduledId}/incidents`,
                { params: severityFilter === 'ALL' ? {} : { severity: severityFilter } },
            );
            set({ incidents: res.data.incidents });
        } catch (err: unknown) {
            set({ error: errorMessage(err, 'Failed to load incidents') });
        }
    },

    fetchStudentIncidents: async (scheduledId, examSessionId) => {
        try {
            const res = await api.get<IncidentEnvelope>(
                `scheduled-sessions/${scheduledId}/incidents`,
                { params: { exam_session_id: examSessionId, page_size: 200 } },
            );
            set({ studentIncidents: res.data.incidents });
        } catch (err: unknown) {
            set({ error: errorMessage(err, 'Failed to load student incidents') });
        }
    },

    setSeverityFilter: (severityFilter) => set({ severityFilter }),

    terminate: async (sessionId) => {
        await api.post(`exam-sessions/${sessionId}/terminate`);
    },
}));

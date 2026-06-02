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
    is_paused: boolean;
    flagged_for_review: boolean;
    incident_count: number;
}

export interface ProctoringIncident {
    id: string;
    incident_type: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    source: 'SERVER' | 'CLIENT';
    detail: Record<string, unknown>;
    created_at: string;
    student_id?: string | null;
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
    serverNow: string | null;
    isLoading: boolean;
    error: string | null;
    severityFilter: IncidentSeverityFilter;

    fetchMonitor: (scheduledId: string) => Promise<void>;
    fetchIncidents: (scheduledId: string) => Promise<void>;
    setSeverityFilter: (f: IncidentSeverityFilter) => void;

    extend: (sessionId: string, minutes: number) => Promise<void>;
    pause: (sessionId: string) => Promise<void>;
    resume: (sessionId: string) => Promise<void>;
    terminate: (sessionId: string) => Promise<void>;
}

export const useProctoringStore = create<ProctoringState>((set, get) => ({
    attempts: [],
    incidents: [],
    serverNow: null,
    isLoading: false,
    error: null,
    severityFilter: 'ALL',

    fetchMonitor: async (scheduledId) => {
        try {
            const res = await api.get<MonitorEnvelope>(
                `scheduled-sessions/${scheduledId}/monitor`,
            );
            set({ attempts: res.data.attempts, serverNow: res.data.server_now, error: null });
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

    setSeverityFilter: (severityFilter) => set({ severityFilter }),

    extend: async (sessionId, minutes) => {
        await api.post(`exam-sessions/${sessionId}/extend`, { minutes });
    },
    pause: async (sessionId) => {
        await api.post(`exam-sessions/${sessionId}/pause`);
    },
    resume: async (sessionId) => {
        await api.post(`exam-sessions/${sessionId}/resume`);
    },
    terminate: async (sessionId) => {
        await api.post(`exam-sessions/${sessionId}/terminate`);
    },
}));

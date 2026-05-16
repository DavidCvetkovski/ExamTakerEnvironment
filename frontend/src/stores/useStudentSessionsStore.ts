import { create } from 'zustand';

import { api } from '@/lib/api';
import { recordServerNow } from '@/lib/serverTime';

interface StudentScheduledSessionListEnvelope {
    sessions: StudentScheduledSession[];
    server_now: string;
}

export interface StudentScheduledSession {
    id: string;
    course_id: string;
    course_code: string;
    course_title: string;
    test_definition_id: string;
    test_title: string;
    starts_at: string;
    ends_at: string;
    status: 'SCHEDULED' | 'ACTIVE' | 'CLOSED' | 'CANCELED';
    can_join: boolean;
    existing_attempt_id: string | null;
    existing_attempt_status: 'STARTED' | 'SUBMITTED' | 'EXPIRED' | null;
}

interface StudentSessionsState {
    sessions: StudentScheduledSession[];
    isLoading: boolean;
    error: string | null;
    fetchSessions: () => Promise<void>;
}

export const useStudentSessionsStore = create<StudentSessionsState>((set) => ({
    sessions: [],
    isLoading: false,
    error: null,

    fetchSessions: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get<StudentScheduledSessionListEnvelope>(
                '/student/sessions/',
            );
            recordServerNow(response.data.server_now);
            set({ sessions: response.data.sessions, isLoading: false });
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail || 'Failed to fetch your sessions';
            set({ error: message, isLoading: false });
        }
    },
}));

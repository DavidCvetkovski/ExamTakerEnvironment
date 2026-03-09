import { create } from 'zustand';

import { api } from '@/lib/api';

export interface ScheduledSession {
    id: string;
    course_id: string;
    course_code: string;
    course_title: string;
    test_definition_id: string;
    test_title: string;
    created_by?: string | null;
    starts_at: string;
    ends_at: string;
    status: 'SCHEDULED' | 'ACTIVE' | 'CLOSED' | 'CANCELED';
    duration_minutes_override?: number | null;
    created_at: string;
    updated_at?: string | null;
}

interface SessionManagerState {
    scheduledSessions: ScheduledSession[];
    isLoading: boolean;
    error: string | null;
    fetchScheduledSessions: () => Promise<void>;
    createScheduledSession: (payload: {
        course_id: string;
        test_definition_id: string;
        starts_at: string;
        duration_minutes_override?: number;
    }) => Promise<void>;
    cancelScheduledSession: (sessionId: string) => Promise<void>;
    startPracticeSession: (testDefinitionId: string) => Promise<string>;
}

export const useSessionManagerStore = create<SessionManagerState>((set, get) => ({
    scheduledSessions: [],
    isLoading: false,
    error: null,

    fetchScheduledSessions: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get<ScheduledSession[]>('/scheduled-sessions/');
            set({ scheduledSessions: response.data, isLoading: false });
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail || 'Failed to fetch scheduled sessions';
            set({ error: message, isLoading: false });
        }
    },

    createScheduledSession: async (payload) => {
        set({ isLoading: true, error: null });
        try {
            await api.post('/scheduled-sessions/', payload);
            await get().fetchScheduledSessions();
            set({ isLoading: false });
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail || 'Failed to create scheduled session';
            set({ error: message, isLoading: false });
            throw new Error(message);
        }
    },

    cancelScheduledSession: async (sessionId) => {
        set({ isLoading: true, error: null });
        try {
            await api.post(`/scheduled-sessions/${sessionId}/cancel`);
            await get().fetchScheduledSessions();
            set({ isLoading: false });
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail || 'Failed to cancel scheduled session';
            set({ error: message, isLoading: false });
            throw new Error(message);
        }
    },

    startPracticeSession: async (testDefinitionId) => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.post<{ id: string }>('/sessions/practice', {
                test_definition_id: testDefinitionId,
            });
            set({ isLoading: false });
            return response.data.id;
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail || 'Failed to start practice session';
            set({ error: message, isLoading: false });
            throw new Error(message);
        }
    },
}));

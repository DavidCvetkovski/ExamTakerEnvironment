import { create } from 'zustand';
import { api } from '@/lib/api';

interface ExamItem {
    learning_object_id: string;
    item_version_id: string;
    content: any;
    options: any;
    question_type: string;
    version_number: number;
}

interface ExamSession {
    id: string;
    test_definition_id: string;
    student_id: string;
    items: ExamItem[];
    status: 'STARTED' | 'SUBMITTED' | 'EXPIRED';
    started_at: string;
    expires_at: string;
}

interface ExamState {
    currentSession: ExamSession | null;
    isLoading: boolean;
    error: string | null;

    fetchSession: (sessionId: string) => Promise<void>;
    instantiateSession: (testId: string) => Promise<string>;
}

export const useExamStore = create<ExamState>((set) => ({
    currentSession: null,
    isLoading: false,
    error: null,

    fetchSession: async (sessionId: string) => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get(`/sessions/${sessionId}`);
            set({ currentSession: response.data, isLoading: false });
        } catch (err: any) {
            set({ error: err.response?.data?.detail || 'Failed to fetch exam session', isLoading: false });
        }
    },

    instantiateSession: async (testId: string) => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.post('/sessions/', { test_definition_id: testId });
            set({ currentSession: response.data, isLoading: false });
            return response.data.id;
        } catch (err: any) {
            const msg = err.response?.data?.detail || 'Failed to start exam';
            set({ error: msg, isLoading: false });
            throw new Error(msg);
        }
    },
}));

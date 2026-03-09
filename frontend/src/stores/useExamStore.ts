import { create } from 'zustand';
import { api } from '@/lib/api';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExamItem {
    learning_object_id: string;
    item_version_id: string;
    content: Record<string, unknown>;
    options: Record<string, unknown>;
    question_type: string;
    version_number: number;
}

export interface ExamSession {
    id: string;
    test_definition_id: string;
    student_id: string;
    scheduled_session_id: string | null;
    items: ExamItem[];
    status: 'STARTED' | 'SUBMITTED' | 'EXPIRED';
    session_mode: 'ASSIGNED' | 'PRACTICE';
    started_at: string;
    submitted_at: string | null;
    expires_at: string;
    return_path: string;
}

export interface InteractionEvent {
    learning_object_id: string | null;
    item_version_id: string | null;
    event_type: 'ANSWER_CHANGE' | 'FLAG_TOGGLE' | 'NAVIGATION';
    payload: Record<string, unknown>;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

let saveStatusResetTimer: ReturnType<typeof setTimeout> | null = null;

interface ExamState {
    // Session
    currentSession: ExamSession | null;
    isLoading: boolean;
    error: string | null;

    // Question navigation
    currentQuestionIndex: number;

    // Answer & flag state (keyed by learning_object_id)
    answers: Record<string, Record<string, unknown>>;
    flags: Record<string, boolean>;

    // Heartbeat event queue
    pendingEvents: InteractionEvent[];
    saveStatus: SaveStatus;
    lastSavedAt: string | null;

    // Actions — session lifecycle
    fetchSession: (sessionId: string) => Promise<void>;
    instantiateSession: (testId: string) => Promise<string>;
    joinScheduledSession: (scheduledSessionId: string) => Promise<string>;
    submitExam: (sessionId: string) => Promise<void>;

    // Actions — answer & navigation
    setAnswer: (loId: string, ivId: string, questionType: string, payload: Record<string, unknown>) => void;
    toggleFlag: (loId: string, ivId: string) => void;
    navigateTo: (index: number) => void;

    // Actions — heartbeat
    queueEvent: (event: InteractionEvent) => void;
    flushEvents: (sessionId: string) => Promise<void>;
    loadSavedAnswers: (sessionId: string) => Promise<void>;
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useExamStore = create<ExamState>((set, get) => ({
    // Initial state
    currentSession: null,
    isLoading: false,
    error: null,
    currentQuestionIndex: 0,
    answers: {},
    flags: {},
    pendingEvents: [],
    saveStatus: 'idle',
    lastSavedAt: null,

    // ── Session Lifecycle ────────────────────────────────────────────────

    fetchSession: async (sessionId: string) => {
        set({
            isLoading: true,
            error: null,
            currentQuestionIndex: 0,
            answers: {},
            flags: {},
            pendingEvents: [],
        });
        try {
            const response = await api.get(`/sessions/${sessionId}`);
            set({ currentSession: response.data, isLoading: false });
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail || 'Failed to fetch exam session';
            set({ error: message, isLoading: false });
        }
    },

    instantiateSession: async (testId: string) => {
        set({ isLoading: true, error: null, currentQuestionIndex: 0, answers: {}, flags: {}, pendingEvents: [] });
        try {
            const response = await api.post('/sessions/practice', { test_definition_id: testId });
            set({ currentSession: response.data, isLoading: false });
            return response.data.id;
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail || 'Failed to start practice exam';
            set({ error: msg, isLoading: false });
            throw new Error(msg);
        }
    },

    joinScheduledSession: async (scheduledSessionId: string) => {
        set({ isLoading: true, error: null, currentQuestionIndex: 0, answers: {}, flags: {}, pendingEvents: [] });
        try {
            const response = await api.post(`/student/sessions/${scheduledSessionId}/join`);
            set({ currentSession: response.data, isLoading: false });
            return response.data.id;
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail || 'Failed to join scheduled exam';
            set({ error: msg, isLoading: false });
            throw new Error(msg);
        }
    },

    submitExam: async (sessionId: string) => {
        set({ isLoading: true, error: null });
        try {
            // Flush any remaining events before submitting
            await get().flushEvents(sessionId);
            const response = await api.post(`/sessions/${sessionId}/submit`);
            set({ currentSession: response.data, isLoading: false });
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail || 'Failed to submit exam';
            set({ error: msg, isLoading: false });
            throw new Error(msg);
        }
    },

    // ── Answer & Navigation ──────────────────────────────────────────────

    setAnswer: (loId, ivId, _questionType, payload) => {
        const event: InteractionEvent = {
            learning_object_id: loId,
            item_version_id: ivId,
            event_type: 'ANSWER_CHANGE',
            payload,
        };
        set((state) => ({
            answers: { ...state.answers, [loId]: payload },
            pendingEvents: [...state.pendingEvents, event],
        }));
    },

    toggleFlag: (loId, ivId) => {
        const currentlyFlagged = get().flags[loId] || false;
        const newFlagged = !currentlyFlagged;
        const event: InteractionEvent = {
            learning_object_id: loId,
            item_version_id: ivId,
            event_type: 'FLAG_TOGGLE',
            payload: { flagged: newFlagged },
        };
        set((state) => ({
            flags: { ...state.flags, [loId]: newFlagged },
            pendingEvents: [...state.pendingEvents, event],
        }));
    },

    navigateTo: (index: number) => {
        const state = get();
        const session = state.currentSession;
        if (!session) return;

        const fromIndex = state.currentQuestionIndex;
        if (index < 0 || index >= session.items.length || index === fromIndex) return;

        const event: InteractionEvent = {
            learning_object_id: null,
            item_version_id: null,
            event_type: 'NAVIGATION',
            payload: { from_index: fromIndex, to_index: index },
        };
        set((s) => ({
            currentQuestionIndex: index,
            pendingEvents: [...s.pendingEvents, event],
        }));
    },

    // ── Heartbeat ────────────────────────────────────────────────────────

    queueEvent: (event) => {
        set((state) => ({
            pendingEvents: [...state.pendingEvents, event],
        }));
    },

    flushEvents: async (sessionId: string) => {
        const events = get().pendingEvents;
        if (events.length === 0) return;

        if (saveStatusResetTimer) {
            clearTimeout(saveStatusResetTimer);
            saveStatusResetTimer = null;
        }

        set({ saveStatus: 'saving' });
        try {
            await api.post(`/sessions/${sessionId}/heartbeat`, { events });
            set({
                pendingEvents: [],
                saveStatus: 'saved',
                lastSavedAt: new Date().toISOString(),
            });
            saveStatusResetTimer = setTimeout(() => {
                const state = get();
                if (state.saveStatus === 'saved') {
                    set({ saveStatus: 'idle' });
                }
            }, 2500);
        } catch {
            set({ saveStatus: 'error' });

            // Persist to localStorage as offline fallback
            try {
                const key = `openvision_heartbeat_queue_${sessionId}`;
                const existing = localStorage.getItem(key);
                const queued = existing ? JSON.parse(existing) : [];
                localStorage.setItem(key, JSON.stringify([...queued, ...events]));
            } catch {
                // localStorage unavailable — events stay in memory for retry
            }
        }
    },

    loadSavedAnswers: async (sessionId: string) => {
        try {
            // First, try to drain any localStorage queue
            const key = `openvision_heartbeat_queue_${sessionId}`;
            const stored = localStorage.getItem(key);
            if (stored) {
                const queued = JSON.parse(stored);
                if (queued.length > 0) {
                    await api.post(`/sessions/${sessionId}/heartbeat`, { events: queued });
                    localStorage.removeItem(key);
                }
            }
        } catch {
            // Offline queue drain failed — server state is still authoritative
        }

        try {
            const response = await api.get(`/sessions/${sessionId}/answers`);
            const { answers, flags } = response.data;
            set({ answers: answers || {}, flags: flags || {} });
        } catch {
            // If recovery fails, start fresh — local state was empty anyway
        }
    },
}));

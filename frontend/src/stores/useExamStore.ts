import { create } from 'zustand';
import { api } from '@/lib/api';

function extractApiError(err: unknown, fallback: string): string {
    const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((e: { msg?: string }) => e.msg ?? String(e)).join('; ');
    return fallback;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExamItem {
    learning_object_id: string;
    item_version_id: string;
    content: unknown;
    options: unknown;
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
    // Epoch 11 — proctoring state (advisory client UX; backend 403 is authoritative).
    paused_at?: string | null;
    flagged_for_review?: boolean;
    proctoring?: ClientProctoringView | null;
}

/** Secret-free proctoring policy the exam client needs to drive its UX. */
export interface ClientProctoringView {
    require_seb: boolean;
    block_copy_paste: boolean;
    suppress_context_menu: boolean;
    detect_focus_loss: boolean;
    require_fullscreen: boolean;
    detect_session_sharing: boolean;
}

export interface InteractionEvent {
    client_event_id: string;
    learning_object_id: string | null;
    item_version_id: string | null;
    event_type: 'ANSWER_CHANGE' | 'FLAG_TOGGLE' | 'NAVIGATION';
    payload: Record<string, unknown>;
    client_created_at: string;
}

function createClientEventId(): string {
    const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined;
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
        return cryptoObj.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
        cryptoObj.getRandomValues(bytes);
    } else {
        for (let i = 0; i < 16; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10xxxxxx
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}


export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

let saveStatusResetTimer: ReturnType<typeof setTimeout> | null = null;
let activeFlushPromise: Promise<void> | null = null;

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
    /** Quietly re-check server status; flips the UI to the submitted screen if a
     *  supervisor terminated the attempt (or it expired) out from under us. */
    syncStatus: (sessionId: string) => Promise<void>;
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
            set({ error: extractApiError(err, 'Failed to fetch exam session'), isLoading: false });
        }
    },

    instantiateSession: async (testId: string) => {
        set({ isLoading: true, error: null, currentQuestionIndex: 0, answers: {}, flags: {}, pendingEvents: [] });
        try {
            const response = await api.post('/sessions/practice', { test_definition_id: testId });
            set({ currentSession: response.data, isLoading: false });
            return response.data.id;
        } catch (err: unknown) {
            const msg = extractApiError(err, 'Failed to start practice exam');
            set({ error: msg, isLoading: false });
            throw new Error(msg);
        }
    },

    joinScheduledSession: async (scheduledSessionId: string) => {
        // S-5: flush any in-memory events from a previous session before we reset
        // store state, so queued answers are never silently dropped on a rapid
        // re-join. flushEvents persists to localStorage on failure as a backstop.
        const prev = get().currentSession;
        if (prev && get().pendingEvents.length > 0) {
            await get().flushEvents(prev.id);
        }
        set({ isLoading: true, error: null, currentQuestionIndex: 0, answers: {}, flags: {}, pendingEvents: [] });
        try {
            const response = await api.post(`/student/sessions/${scheduledSessionId}/join`);
            set({ currentSession: response.data, isLoading: false });
            return response.data.id;
        } catch (err: unknown) {
            const msg = extractApiError(err, 'Failed to join scheduled exam');
            set({ error: msg, isLoading: false });
            throw new Error(msg);
        }
    },

    submitExam: async (sessionId: string) => {
        // H-7: ignore a duplicate submit while one is already in flight, so a
        // double-click can't fire two POST /submit requests.
        if (get().isLoading) return;
        set({ isLoading: true, error: null });
        try {
            // Flush any remaining events before submitting
            await get().flushEvents(sessionId);
            const response = await api.post(`/sessions/${sessionId}/submit`);
            set({ currentSession: response.data, isLoading: false });
        } catch (err: unknown) {
            const msg = extractApiError(err, 'Failed to submit exam');
            set({ error: msg, isLoading: false });
            throw new Error(msg);
        }
    },

    // ── Answer & Navigation ──────────────────────────────────────────────

    setAnswer: (loId, ivId, _questionType, payload) => {
        const event: InteractionEvent = {
            client_event_id: createClientEventId(),
            learning_object_id: loId,
            item_version_id: ivId,
            event_type: 'ANSWER_CHANGE',
            payload,
            client_created_at: new Date().toISOString(),
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
            client_event_id: createClientEventId(),
            learning_object_id: loId,
            item_version_id: ivId,
            event_type: 'FLAG_TOGGLE',
            payload: { flagged: newFlagged },
            client_created_at: new Date().toISOString(),
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
            client_event_id: createClientEventId(),
            learning_object_id: null,
            item_version_id: null,
            event_type: 'NAVIGATION',
            payload: { from_index: fromIndex, to_index: index },
            client_created_at: new Date().toISOString(),
        };
        // H-4: remember the last-seen question per session so a resume/refresh
        // returns the student where they left off (restored in loadSavedAnswers).
        try {
            localStorage.setItem(`openvision_q_index_${session.id}`, String(index));
        } catch {
            // localStorage unavailable — non-fatal, resume just falls back to Q1.
        }
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
        if (activeFlushPromise) {
            await activeFlushPromise;
            return;
        }

        if (get().pendingEvents.length === 0) return;

        activeFlushPromise = (async () => {
            while (true) {
                const events = get().pendingEvents;
                if (events.length === 0) {
                    return;
                }

                if (saveStatusResetTimer) {
                    clearTimeout(saveStatusResetTimer);
                    saveStatusResetTimer = null;
                }

                set({ saveStatus: 'saving' });
                try {
                    await api.post(`/sessions/${sessionId}/heartbeat`, { events });
                    set((state) => ({
                        pendingEvents: state.pendingEvents.filter((event) => !events.includes(event)),
                        saveStatus: 'saved',
                        lastSavedAt: new Date().toISOString(),
                    }));
                    saveStatusResetTimer = setTimeout(() => {
                        const state = get();
                        if (state.saveStatus === 'saved') {
                            set({ saveStatus: 'idle' });
                        }
                    }, 2500);
                } catch (err: unknown) {
                    // A 409 means the attempt is no longer STARTED — most often a
                    // supervisor terminated it. Flip straight to the submitted
                    // screen instead of silently retrying forever.
                    const statusCode = (err as { response?: { status?: number } })?.response?.status;
                    if (statusCode === 409) {
                        set((state) => ({
                            pendingEvents: [],
                            saveStatus: 'idle',
                            currentSession: state.currentSession
                                ? { ...state.currentSession, status: 'SUBMITTED' }
                                : state.currentSession,
                        }));
                        return;
                    }
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
                    return;
                }
            }
        })().finally(() => {
            activeFlushPromise = null;
        });

        await activeFlushPromise;
    },

    loadSavedAnswers: async (sessionId: string) => {
        // Drain any localStorage heartbeat queue from a prior offline tab-close.
        const key = `openvision_heartbeat_queue_${sessionId}`;
        try {
            const stored = localStorage.getItem(key);
            if (stored) {
                const queued = JSON.parse(stored);
                if (queued.length > 0) {
                    await api.post(`/sessions/${sessionId}/heartbeat`, { events: queued });
                }
            }
            // Success → clear the queue.
            localStorage.removeItem(key);
        } catch (err: unknown) {
            // M-4: only clear on a definitive 4xx (this session isn't ours / is
            // gone) — otherwise a transient/offline failure must KEEP the queue so
            // the student's recovered answers aren't discarded, and it retries on
            // the next load.
            const status = (err as { response?: { status?: number } })?.response?.status;
            if (status === 403 || status === 404) {
                try { localStorage.removeItem(key); } catch { /* noop */ }
            }
        }

        try {
            const response = await api.get(`/sessions/${sessionId}/answers`);
            const { answers, flags } = response.data;
            set({ answers: answers || {}, flags: flags || {} });
            // H-4: restore the last-seen question index (clamped to the item range).
            const savedIndex = Number(localStorage.getItem(`openvision_q_index_${sessionId}`));
            const itemCount = get().currentSession?.items.length ?? 0;
            if (Number.isInteger(savedIndex) && savedIndex > 0 && savedIndex < itemCount) {
                set({ currentQuestionIndex: savedIndex });
            }
        } catch {
            // If recovery fails, start fresh — local state was empty anyway
        }
    },

    syncStatus: async (sessionId: string) => {
        const current = get().currentSession;
        if (!current || current.status !== 'STARTED') return;
        try {
            const response = await api.get(`/sessions/${sessionId}`);
            if (response.data?.status && response.data.status !== 'STARTED') {
                // Replace with the authoritative server copy so the page renders
                // the submission/terminated confirmation immediately.
                set({ currentSession: response.data });
            }
        } catch {
            // Transient failure — the heartbeat 409 path is the backstop.
        }
    },
}));

/**
 * useGradingStore.ts
 *
 * Zustand store for the instructor grading dashboard.
 * Handles grading overview, per-session question grades,
 * manual grade submission, publication, and CSV export.
 */
import { create } from 'zustand';
import { api } from '../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SessionGradingSummary {
    session_id: string;
    student_id: string;
    student_email: string | null;
    student_vunet_id: string | null;
    submitted_at: string | null;
    grading_status: GradingStatus;
    questions_graded: number;
    questions_total: number;
    total_points: number;
    max_points: number;
    percentage: number;
    is_published: boolean;
}

export interface QuestionGrade {
    id: string;
    session_id: string;
    learning_object_id: string;
    item_version_id: string;
    question_type: string | null;
    question_content: unknown | null;
    question_options: unknown | null;
    points_awarded: number;
    points_possible: number;
    is_correct: boolean | null;
    is_auto_graded: boolean;
    feedback: string | null;
    rubric_data: Record<string, unknown> | null;
    student_answer: Record<string, unknown>;
    correct_answer: Record<string, unknown> | null;
    created_at: string;
    updated_at: string | null;
}

export interface SessionResult {
    id: string;
    session_id: string;
    test_definition_id: string;
    test_title?: string | null;
    student_id: string;
    total_points: number;
    max_points: number;
    percentage: number;
    grading_status: GradingStatus;
    questions_graded: number;
    questions_total: number;
    letter_grade: string | null;
    passed: boolean | null;
    is_published: boolean;
    published_at: string | null;
}

export interface ManualGradePayload {
    points_awarded: number;
    feedback?: string;
    rubric_data?: Record<string, unknown>;
}

export type GradingStatus = 'UNGRADED' | 'AUTO_GRADED' | 'PARTIALLY_GRADED' | 'FULLY_GRADED';

export type PublishStatus = 'idle' | 'publishing' | 'published' | 'error';

// ─── Store ────────────────────────────────────────────────────────────────────

interface GradingState {
    // Overview
    selectedTestId: string | null;
    gradingOverview: SessionGradingSummary[];
    overviewLoading: boolean;

    // Per-session grading
    currentSessionId: string | null;
    questionGrades: QuestionGrade[];
    sessionResult: SessionResult | null;
    gradesLoading: boolean;

    // Submission
    submittingGradeId: string | null;

    // Blind mode
    blindMode: boolean;

    // Publication
    publishStatus: PublishStatus;

    // Errors
    error: string | null;

    // Actions
    setSelectedTestId: (testId: string) => void;
    fetchGradingOverview: (testId: string) => Promise<void>;
    fetchSessionGrades: (sessionId: string) => Promise<void>;
    fetchSessionResult: (sessionId: string) => Promise<void>;
    submitManualGrade: (gradeId: string, payload: ManualGradePayload) => Promise<void>;
    publishResults: (testId: string) => Promise<void>;
    unpublishResults: (testId: string) => Promise<void>;
    exportCsv: (testId: string) => Promise<void>;
    toggleBlindMode: () => void;
    clearError: () => void;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
    return (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;
}

export const useGradingStore = create<GradingState>((set, get) => ({
    // ── Initial state ──────────────────────────────────────────────────────
    selectedTestId: null,
    gradingOverview: [],
    overviewLoading: false,
    currentSessionId: null,
    questionGrades: [],
    sessionResult: null,
    gradesLoading: false,
    submittingGradeId: null,
    blindMode: false,
    publishStatus: 'idle',
    error: null,

    setSelectedTestId: (testId) => {
        set({ selectedTestId: testId });
    },

    // ── Grading overview ───────────────────────────────────────────────────
    fetchGradingOverview: async (testId: string) => {
        set({ overviewLoading: true, error: null, selectedTestId: testId });
        try {
            const res = await api.get<SessionGradingSummary[]>(
                `grading/tests/${testId}/grading-overview`
            );
            set({ gradingOverview: res.data, overviewLoading: false });
        } catch (err) {
            set({ error: getApiErrorMessage(err, 'Failed to load grading overview'), overviewLoading: false });
        }
    },

    // ── Per-session grades ─────────────────────────────────────────────────
    fetchSessionGrades: async (sessionId: string) => {
        set({ gradesLoading: true, error: null, currentSessionId: sessionId, questionGrades: [], sessionResult: null });
        try {
            const [gradesRes, resultRes] = await Promise.all([
                api.get<QuestionGrade[]>(`grading/sessions/${sessionId}/grades`),
                api.get<SessionResult>(`grading/sessions/${sessionId}/result`),
            ]);
            set({ questionGrades: gradesRes.data, sessionResult: resultRes.data, gradesLoading: false });
        } catch (err) {
            set({ error: getApiErrorMessage(err, 'Failed to load session grades'), gradesLoading: false });
        }
    },

    fetchSessionResult: async (sessionId: string) => {
        try {
            const res = await api.get<SessionResult>(`grading/sessions/${sessionId}/result`);
            set({ sessionResult: res.data });
        } catch (err) {
            set({ error: getApiErrorMessage(err, 'Failed to load session result') });
        }
    },

    // ── Manual grading ─────────────────────────────────────────────────────
    submitManualGrade: async (gradeId: string, payload: ManualGradePayload) => {
        set({ submittingGradeId: gradeId, error: null });
        try {
            await api.patch(`grading/grades/${gradeId}`, payload);
            // Refresh grades and result after manual save
            const sessionId = get().currentSessionId;
            if (sessionId) {
                const [gradesRes, resultRes] = await Promise.all([
                    api.get<QuestionGrade[]>(`grading/sessions/${sessionId}/grades`),
                    api.get<SessionResult>(`grading/sessions/${sessionId}/result`),
                ]);
                set({ questionGrades: gradesRes.data, sessionResult: resultRes.data });
            }
            // Also refresh overview to reflect updated grading_status
            const testId = get().selectedTestId;
            if (testId) {
                const overviewRes = await api.get<SessionGradingSummary[]>(
                    `grading/tests/${testId}/grading-overview`
                );
                set({ gradingOverview: overviewRes.data });
            }
        } catch (err) {
            set({ error: getApiErrorMessage(err, 'Failed to save grade') });
        } finally {
            set({ submittingGradeId: null });
        }
    },

    // ── Publication ────────────────────────────────────────────────────────
    publishResults: async (testId: string) => {
        set({ publishStatus: 'publishing', error: null });
        try {
            await api.post(`grading/tests/${testId}/publish-results`);
            set({ publishStatus: 'published' });
            // Refresh overview
            const overviewRes = await api.get<SessionGradingSummary[]>(
                `grading/tests/${testId}/grading-overview`
            );
            set({ gradingOverview: overviewRes.data });
        } catch (err) {
            set({ publishStatus: 'error', error: getApiErrorMessage(err, 'Failed to publish results') });
        }
    },

    unpublishResults: async (testId: string) => {
        set({ publishStatus: 'publishing', error: null });
        try {
            await api.post(`grading/tests/${testId}/unpublish-results`);
            set({ publishStatus: 'idle' });
            const overviewRes = await api.get<SessionGradingSummary[]>(
                `grading/tests/${testId}/grading-overview`
            );
            set({ gradingOverview: overviewRes.data });
        } catch (err) {
            set({ publishStatus: 'error', error: getApiErrorMessage(err, 'Failed to unpublish results') });
        }
    },

    // ── CSV Export ─────────────────────────────────────────────────────────
    exportCsv: async (testId: string) => {
        try {
            const res = await api.get(`grading/tests/${testId}/export`, {
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([res.data as BlobPart]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `results_${testId}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            set({ error: getApiErrorMessage(err, 'Failed to export CSV') });
        }
    },

    // ── Misc ───────────────────────────────────────────────────────────────
    toggleBlindMode: () => set((s) => ({ blindMode: !s.blindMode })),
    clearError: () => set({ error: null }),
}));

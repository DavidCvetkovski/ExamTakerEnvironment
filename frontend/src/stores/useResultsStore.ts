/**
 * useResultsStore.ts
 *
 * Zustand store for the results dashboard (instructor) and student my-results view.
 * Separate from useGradingStore to keep domains clean.
 */
import { create } from 'zustand';
import { api } from '../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StudentResult {
    session_id: string;
    test_definition_id: string;
    test_title?: string;
    submitted_at: string | null;
    total_points: number;
    max_points: number;
    percentage: number;
    letter_grade: string | null;
    passed: boolean | null;
    grading_status: string;
    is_published: boolean;
    published_at: string | null;
}

export interface QuestionResultDetail {
    grade_id: string;
    learning_object_id: string;
    item_version_id: string;
    question_type: string;
    question_content: Record<string, unknown> | null;
    student_answer: Record<string, unknown>;
    correct_answer: Record<string, unknown> | null;
    points_awarded: number;
    points_possible: number;
    is_correct: boolean | null;
    is_auto_graded: boolean;
    feedback: string | null;
}

export interface StudentResultDetail {
    session_id: string;
    test_title: string;
    submitted_at: string | null;
    total_points: number;
    max_points: number;
    percentage: number;
    letter_grade: string | null;
    passed: boolean | null;
    grading_status: string;
    question_results: QuestionResultDetail[];
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface ResultsState {
    // Student results
    myResults: StudentResult[];
    myResultsLoading: boolean;

    // Student result detail
    currentResultDetail: StudentResultDetail | null;
    detailLoading: boolean;

    error: string | null;

    // Actions
    fetchMyResults: () => Promise<void>;
    fetchMyResultDetail: (sessionId: string) => Promise<void>;
    clearError: () => void;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
    return (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;
}

export const useResultsStore = create<ResultsState>((set) => ({
    myResults: [],
    myResultsLoading: false,
    currentResultDetail: null,
    detailLoading: false,
    error: null,

    fetchMyResults: async () => {
        set({ myResultsLoading: true, error: null });
        try {
            const res = await api.get<StudentResult[]>('grading/my-results');
            set({ myResults: res.data, myResultsLoading: false });
        } catch (err) {
            set({
                error: getApiErrorMessage(err, 'Failed to load your results'),
                myResultsLoading: false,
            });
        }
    },

    fetchMyResultDetail: async (sessionId: string) => {
        set({ detailLoading: true, error: null, currentResultDetail: null });
        try {
            const res = await api.get<StudentResultDetail>(`grading/my-results/${sessionId}`);
            set({ currentResultDetail: res.data, detailLoading: false });
        } catch (err) {
            set({
                error: getApiErrorMessage(err, 'Failed to load result details'),
                detailLoading: false,
            });
        }
    },

    clearError: () => set({ error: null }),
}));

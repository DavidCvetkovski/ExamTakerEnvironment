import { create } from 'zustand';
import { api } from '../lib/api';

export interface LearningObjectSummary {
    id: string;
    bank_id: string;
    created_at: string;
    latest_version_number: number;
    latest_status: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'RETIRED';
    latest_question_type: 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'ESSAY';
    latest_content_preview: string;
    metadata_tags?: Record<string, unknown>;
}

interface LibraryState {
    items: LearningObjectSummary[];
    isLoading: boolean;
    error: string | null;
    fetchItems: () => Promise<void>;
    createItem: () => Promise<string>;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
    return (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;
}

export const useLibraryStore = create<LibraryState>((set) => ({
    items: [],
    isLoading: false,
    error: null,

    fetchItems: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get<LearningObjectSummary[]>('learning-objects');
            set({ items: response.data, isLoading: false });
        } catch (err: unknown) {
            console.error('Failed to fetch library items:', err);
            set({ error: getApiErrorMessage(err, 'Failed to load items'), isLoading: false });
        }
    },

    createItem: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.post<{ status: string, learning_object_id: string }>('learning-objects');
            // Refresh list
            await useLibraryStore.getState().fetchItems();
            return response.data.learning_object_id;
        } catch (err: unknown) {
            console.error('Failed to create new item:', err);
            set({ error: getApiErrorMessage(err, 'Failed to create item'), isLoading: false });
            throw err;
        }
    },
}));

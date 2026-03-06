import { create } from 'zustand';
import { api } from '../lib/api';

interface MCQOption {
    id: string;
    text: string;
    is_correct: boolean;
    weight: number;
}

interface AuthoringState {
    // Core item state
    learningObjectId: string | null;
    itemId: string | null;
    versionNumber: number;
    saveStatus: 'IDLE' | 'SAVING' | 'SAVED' | 'ERROR';
    questionType: 'MULTIPLE_CHOICE' | 'ESSAY';
    tiptapJson: Record<string, unknown>;
    options: MCQOption[] | { min_words: number; max_words: number };
    metadataTags: Record<string, unknown>;

    // Actions
    setLearningObjectId: (id: string) => void;
    setQuestionType: (type: 'MULTIPLE_CHOICE' | 'ESSAY') => void;
    updateTipTap: (json: Record<string, unknown>) => void;
    updateOptions: (options: MCQOption[] | { min_words: number; max_words: number }) => void;
    updateMetadata: (tags: Record<string, unknown>) => void;
    saveDraft: () => Promise<void>;
    fetchLatestVersion: (loId: string) => Promise<void>;
}

// Debounce timer reference
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export const useAuthoringStore = create<AuthoringState>((set, get) => ({
    learningObjectId: null,
    itemId: null,
    versionNumber: 0,
    saveStatus: 'IDLE',
    questionType: 'MULTIPLE_CHOICE',
    tiptapJson: {},
    options: [],
    metadataTags: {},

    setLearningObjectId: (id) => set({ learningObjectId: id }),
    setQuestionType: (type) => set({ questionType: type }),

    updateTipTap: (json) => {
        set({ tiptapJson: json });
        // Trigger debounced auto-save
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            get().saveDraft();
        }, 3000);
    },

    updateOptions: (options) => set({ options }),
    updateMetadata: (tags) => set({ metadataTags: tags }),

    saveDraft: async () => {
        const state = get();
        if (!state.learningObjectId) return;

        set({ saveStatus: 'SAVING' });

        try {
            const optionsPayload =
                state.questionType === 'MULTIPLE_CHOICE'
                    ? { question_type: 'MULTIPLE_CHOICE', choices: state.options }
                    : { question_type: 'ESSAY', ...(state.options as { min_words: number; max_words: number }) };

            const res = await api.post(`learning-objects/${state.learningObjectId}/versions`, {
                learning_object_id: state.learningObjectId,
                status: 'DRAFT',
                question_type: state.questionType,
                content: state.tiptapJson,
                options: optionsPayload,
                metadata_tags: state.metadataTags,
            });

            const data = res.data;
            set({ itemId: data.id, versionNumber: data.version_number, saveStatus: 'SAVED' });
        } catch {
            set({ saveStatus: 'ERROR' });
        }
    },

    fetchLatestVersion: async (loId: string) => {
        set({ saveStatus: 'SAVING', learningObjectId: loId });
        try {
            const res = await api.get(`learning-objects/${loId}/versions`);
            const versions = res.data;
            if (versions && versions.length > 0) {
                const latest = versions[0];
                let content = latest.content || {};

                // Normalize simple text content to TipTap JSON
                if (content.text && !content.type) {
                    content = {
                        type: 'doc',
                        content: [
                            {
                                type: 'paragraph',
                                content: [{ type: 'text', text: content.text }]
                            }
                        ]
                    };
                }

                set({
                    itemId: latest.id,
                    versionNumber: latest.version_number,
                    questionType: latest.question_type,
                    tiptapJson: content,
                    options: latest.options?.choices || latest.options || [],
                    metadataTags: latest.metadata_tags || {},
                    saveStatus: 'IDLE'
                });
            } else {
                set({ saveStatus: 'IDLE' });
            }
        } catch (error) {
            console.error("Failed to fetch version:", error);
            set({ saveStatus: 'ERROR' });
        }
    },
}));

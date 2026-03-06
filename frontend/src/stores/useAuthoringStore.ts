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
    setQuestionType: (type) => {
        const currentOptions = get().options;
        let newOptions = currentOptions;

        if (type === 'ESSAY' && Array.isArray(currentOptions)) {
            newOptions = { min_words: 50, max_words: 500 };
        } else if (type === 'MULTIPLE_CHOICE' && !Array.isArray(currentOptions)) {
            newOptions = [];
        }

        set({ questionType: type, options: newOptions });
    },

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
            let optionsPayload: any;
            if (state.questionType === 'MULTIPLE_CHOICE') {
                optionsPayload = {
                    question_type: 'MULTIPLE_CHOICE',
                    choices: Array.isArray(state.options) ? state.options : []
                };
            } else {
                const essayOpts = Array.isArray(state.options)
                    ? { min_words: 50, max_words: 500 }
                    : state.options;
                optionsPayload = {
                    question_type: 'ESSAY',
                    ...essayOpts
                };
            }

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
        } catch (error) {
            console.error("Save failed:", error);
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

                // Correctly extract options based on type
                let optionsData: any = latest.options;
                if (latest.question_type === 'MULTIPLE_CHOICE') {
                    const rawChoices = latest.options?.choices || [];
                    // Ensure every choice has an ID (A, B, C...) for backend schema compliance
                    optionsData = Array.isArray(rawChoices) ? rawChoices.map((choice: any, index: number) => ({
                        ...choice,
                        id: choice.id || String.fromCharCode(65 + index),
                        weight: choice.weight ?? 1.0
                    })) : [];
                } else if (latest.question_type === 'ESSAY') {
                    // Extract just the word counts, but exclude question_type from state to avoid spread issues
                    const { question_type, ...rest } = latest.options || {};
                    optionsData = {
                        min_words: rest.min_words ?? 50,
                        max_words: rest.max_words ?? 500
                    };
                }

                set({
                    itemId: latest.id,
                    versionNumber: latest.version_number,
                    questionType: latest.question_type,
                    tiptapJson: content,
                    options: optionsData,
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

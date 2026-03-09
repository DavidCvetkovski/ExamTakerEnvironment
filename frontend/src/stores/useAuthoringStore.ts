import { create } from 'zustand';
import { api } from '../lib/api';

interface MCQOption {
    id: string;
    text: string;
    is_correct: boolean;
    weight: number;
}

interface EssayOptions {
    min_words: number;
    max_words: number;
}

interface StoredItemVersion {
    id: string;
    version_number: number;
    question_type: 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'ESSAY';
    content?: {
        text?: string;
        type?: string;
        content?: Array<Record<string, unknown>>;
    };
    options?: {
        choices?: Array<Partial<MCQOption>>;
        min_words?: number;
        max_words?: number;
    };
    metadata_tags?: Record<string, unknown>;
}

interface AuthoringState {
    // Core item state
    learningObjectId: string | null;
    itemId: string | null;
    versionNumber: number;
    saveStatus: 'IDLE' | 'SAVING' | 'SAVED' | 'ERROR';
    questionType: 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'ESSAY';
    tiptapJson: Record<string, unknown>;
    options: MCQOption[] | EssayOptions;
    metadataTags: Record<string, unknown>;

    // Actions
    setLearningObjectId: (id: string) => void;
    setQuestionType: (type: 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'ESSAY') => void;
    updateTipTap: (json: Record<string, unknown>) => void;
    updateOptions: (options: MCQOption[] | EssayOptions) => void;
    updateMetadata: (tags: Record<string, unknown>) => void;
    updateMetadataField: (key: string, value: unknown) => void;
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
        } else if ((type === 'MULTIPLE_CHOICE' || type === 'MULTIPLE_RESPONSE') && !Array.isArray(currentOptions)) {
            newOptions = [];
        }

        // If switching from Multiple Response to Single Choice, clear extra correct answers
        if (type === 'MULTIPLE_CHOICE' && Array.isArray(newOptions)) {
            let correctFound = false;
            newOptions = newOptions.map(opt => {
                if (opt.is_correct && !correctFound) {
                    correctFound = true;
                    return opt;
                }
                return { ...opt, is_correct: false };
            });
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
    updateMetadataField: (key, value) => {
        set((state) => ({ metadataTags: { ...state.metadataTags, [key]: value } }));
        // Trigger debounced auto-save
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            get().saveDraft();
        }, 3000);
    },

    saveDraft: async () => {
        const state = get();
        if (!state.learningObjectId) return;

        set({ saveStatus: 'SAVING' });

        try {
            let optionsPayload: Record<string, unknown>;
            if (state.questionType === 'MULTIPLE_CHOICE' || state.questionType === 'MULTIPLE_RESPONSE') {
                optionsPayload = {
                    question_type: state.questionType,
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
            const res = await api.get<StoredItemVersion[]>(`learning-objects/${loId}/versions`);
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
                let optionsData: MCQOption[] | EssayOptions = Array.isArray(latest.options?.choices) ? [] : {
                    min_words: latest.options?.min_words ?? 50,
                    max_words: latest.options?.max_words ?? 500
                };
                if (latest.question_type === 'MULTIPLE_CHOICE' || latest.question_type === 'MULTIPLE_RESPONSE') {
                    const rawChoices = latest.options?.choices || [];
                    // Ensure every choice has an ID (A, B, C...) for backend schema compliance
                    optionsData = Array.isArray(rawChoices) ? rawChoices.map((choice, index) => ({
                        ...choice,
                        id: choice.id || String.fromCharCode(65 + index),
                        text: choice.text || '',
                        is_correct: choice.is_correct ?? false,
                        weight: choice.weight ?? 1.0
                    })) : [];
                } else if (latest.question_type === 'ESSAY') {
                    optionsData = {
                        min_words: latest.options?.min_words ?? 50,
                        max_words: latest.options?.max_words ?? 500
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

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

interface DraftSnapshot {
    questionType: 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'ESSAY';
    tiptapJson: Record<string, unknown>;
    options: MCQOption[] | EssayOptions;
    metadataTags: Record<string, unknown>;
}

interface AuthoringState {
    learningObjectId: string | null;
    itemId: string | null;
    versionNumber: number;
    saveStatus: 'IDLE' | 'SAVING' | 'SAVED' | 'ERROR';
    questionType: 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'ESSAY';
    tiptapJson: Record<string, unknown>;
    options: MCQOption[] | EssayOptions;
    metadataTags: Record<string, unknown>;
    serverSnapshot: DraftSnapshot | null;
    isDirty: boolean;
    partialPoints: boolean;

    setLearningObjectId: (id: string) => void;
    setQuestionType: (type: 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'ESSAY') => void;
    updateTipTap: (json: Record<string, unknown>) => void;
    updateOptions: (options: MCQOption[] | EssayOptions) => void;
    updateMetadata: (tags: Record<string, unknown>) => void;
    updateMetadataField: (key: string, value: unknown) => void;
    saveDraft: () => Promise<void>;
    revertChanges: () => void;
    fetchLatestVersion: (loId: string) => Promise<void>;
    setPartialPoints: (on: boolean) => void;
}

function computeIsDirty(state: AuthoringState): boolean {
    if (!state.serverSnapshot) return false;
    const snap = state.serverSnapshot;
    return (
        JSON.stringify(state.tiptapJson) !== JSON.stringify(snap.tiptapJson) ||
        JSON.stringify(state.options) !== JSON.stringify(snap.options) ||
        JSON.stringify(state.metadataTags) !== JSON.stringify(snap.metadataTags) ||
        state.questionType !== snap.questionType
    );
}

export const useAuthoringStore = create<AuthoringState>((set, get) => ({
    learningObjectId: null,
    itemId: null,
    versionNumber: 0,
    saveStatus: 'IDLE',
    questionType: 'MULTIPLE_CHOICE',
    tiptapJson: {},
    options: [],
    metadataTags: {},
    serverSnapshot: null,
    isDirty: false,
    partialPoints: true,

    setLearningObjectId: (id) => set({ learningObjectId: id }),

    setQuestionType: (type) => {
        const currentOptions = get().options;
        let newOptions = currentOptions;

        if (type === 'ESSAY' && Array.isArray(currentOptions)) {
            newOptions = { min_words: 50, max_words: 500 };
        } else if ((type === 'MULTIPLE_CHOICE' || type === 'MULTIPLE_RESPONSE') && !Array.isArray(currentOptions)) {
            newOptions = [];
        }

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

        set((s) => {
            const next = { ...s, questionType: type, options: newOptions };
            return { questionType: type, options: newOptions, isDirty: computeIsDirty(next) };
        });
    },

    updateTipTap: (json) => {
        set((s) => {
            const next = { ...s, tiptapJson: json };
            return { tiptapJson: json, isDirty: computeIsDirty(next) };
        });
    },

    updateOptions: (options) => {
        set((s) => {
            const next = { ...s, options };
            return { options, isDirty: computeIsDirty(next) };
        });
    },

    updateMetadata: (tags) => {
        set((s) => {
            const next = { ...s, metadataTags: tags };
            return { metadataTags: tags, isDirty: computeIsDirty(next) };
        });
    },

    updateMetadataField: (key, value) => {
        set((s) => {
            const metadataTags = { ...s.metadataTags, [key]: value };
            const next = { ...s, metadataTags };
            return { metadataTags, isDirty: computeIsDirty(next) };
        });
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
                    choices: Array.isArray(state.options) ? state.options : [],
                    ...(state.questionType === 'MULTIPLE_RESPONSE' ? { partial_credit: state.partialPoints } : {}),
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
            const snapshot: DraftSnapshot = {
                questionType: state.questionType,
                tiptapJson: structuredClone(state.tiptapJson),
                options: structuredClone(state.options),
                metadataTags: structuredClone(state.metadataTags),
            };
            set({ itemId: data.id, versionNumber: data.version_number, saveStatus: 'SAVED', serverSnapshot: snapshot, isDirty: false });
        } catch (error) {
            console.error("Save failed:", error);
            set({ saveStatus: 'ERROR' });
            throw error;
        }
    },

    revertChanges: () => {
        const snap = get().serverSnapshot;
        if (!snap) return;
        set({
            questionType: snap.questionType,
            tiptapJson: structuredClone(snap.tiptapJson),
            options: structuredClone(snap.options),
            metadataTags: structuredClone(snap.metadataTags),
            isDirty: false,
            saveStatus: 'IDLE',
        });
    },

    fetchLatestVersion: async (loId: string) => {
        set({ saveStatus: 'SAVING', learningObjectId: loId });
        try {
            const res = await api.get<StoredItemVersion[]>(`learning-objects/${loId}/versions`);
            const versions = res.data;
            if (versions && versions.length > 0) {
                const latest = versions[0];
                let content = latest.content || {};

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

                let optionsData: MCQOption[] | EssayOptions = Array.isArray(latest.options?.choices) ? [] : {
                    min_words: latest.options?.min_words ?? 50,
                    max_words: latest.options?.max_words ?? 500
                };
                if (latest.question_type === 'MULTIPLE_CHOICE' || latest.question_type === 'MULTIPLE_RESPONSE') {
                    const rawChoices = latest.options?.choices || [];
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

                const snapshot: DraftSnapshot = {
                    questionType: latest.question_type,
                    tiptapJson: structuredClone(content),
                    options: structuredClone(optionsData),
                    metadataTags: structuredClone(latest.metadata_tags || {}),
                };

                set({
                    itemId: latest.id,
                    versionNumber: latest.version_number,
                    questionType: latest.question_type,
                    tiptapJson: content,
                    options: optionsData,
                    metadataTags: latest.metadata_tags || {},
                    serverSnapshot: snapshot,
                    isDirty: false,
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

    setPartialPoints: (on) => set({ partialPoints: on }),
}));

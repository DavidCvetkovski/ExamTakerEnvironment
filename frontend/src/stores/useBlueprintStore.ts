import { create } from 'zustand';
import { api } from '../lib/api';

export type RuleType = 'FIXED' | 'RANDOM';

export interface SelectionRule {
    rule_type: RuleType;
    learning_object_id?: string;
    count?: number;
    tags?: string[];
    subject?: string;
    topic?: string;
    difficulty?: number;
}

export interface TestBlock {
    title: string;
    rules: SelectionRule[];
}

export interface TestDefinition {
    id: string;
    title: string;
    description?: string;
    blocks: TestBlock[];
    duration_minutes: number;
    shuffle_questions: boolean;
    created_at: string;
    updated_at: string;
}

interface ValidationRule {
    rule: string;
    valid: boolean;
    reason: string;
    matching_count?: number;
}

interface ValidationBlock {
    title: string;
    rule_validation: ValidationRule[];
}

export interface ValidationResponse {
    valid: boolean;
    blocks: ValidationBlock[];
}

export interface AvailableItem {
    id: string;
    latest_question_type: string;
    latest_content_preview: string;
    latest_status: string;
    metadata_tags?: {
        subject?: string;
        topic?: string;
        difficulty?: number;
        estimated_time_mins?: number;
        points?: number;
    };
}

interface BlueprintState {
    blueprints: TestDefinition[];
    currentBlueprint: Partial<TestDefinition> | null;
    availableItems: AvailableItem[];
    isLoading: boolean;
    error: string | null;
    validation: ValidationResponse | null;

    fetchBlueprints: () => Promise<void>;
    fetchBlueprint: (id: string) => Promise<void>;
    fetchAvailableItems: () => Promise<void>;
    saveBlueprint: (data: Partial<TestDefinition>) => Promise<string>;
    validateBlueprint: (id: string) => Promise<void>;
    resetCurrent: () => void;
}

export const useBlueprintStore = create<BlueprintState>((set, get) => ({
    blueprints: [],
    currentBlueprint: null,
    availableItems: [],
    isLoading: false,
    error: null,
    validation: null,

    fetchAvailableItems: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get<AvailableItem[]>('learning-objects');
            set({ availableItems: response.data, isLoading: false });
        } catch (err: any) {
            set({ error: err.response?.data?.detail || 'Failed to fetch items', isLoading: false });
        }
    },

    fetchBlueprints: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get<TestDefinition[]>('tests/');
            set({ blueprints: response.data, isLoading: false });
        } catch (err: any) {
            set({ error: err.response?.data?.detail || 'Failed to fetch blueprints', isLoading: false });
        }
    },

    fetchBlueprint: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get<TestDefinition>(`tests/${id}`);
            set({ currentBlueprint: response.data, isLoading: false });
        } catch (err: any) {
            set({ error: err.response?.data?.detail || 'Failed to fetch blueprint', isLoading: false });
        }
    },

    saveBlueprint: async (data: Partial<TestDefinition>) => {
        set({ isLoading: true, error: null });
        try {
            let response;
            if (data.id) {
                response = await api.put<TestDefinition>(`tests/${data.id}`, data);
            } else {
                response = await api.post<TestDefinition>('tests/', data);
            }
            set({ currentBlueprint: response.data, isLoading: false });
            return response.data.id;
        } catch (err: any) {
            const msg = err.response?.data?.detail || 'Failed to save blueprint';
            set({ error: msg, isLoading: false });
            throw new Error(msg);
        }
    },

    validateBlueprint: async (id: string) => {
        set({ isLoading: true, error: null, validation: null });
        try {
            const response = await api.post<ValidationResponse>(`tests/${id}/validate`);
            set({ validation: response.data, isLoading: false });
        } catch (err: any) {
            set({ error: err.response?.data?.detail || 'Failed to validate blueprint', isLoading: false });
        }
    },

    resetCurrent: () => {
        set({
            currentBlueprint: {
                title: '',
                description: '',
                blocks: [{ title: 'Section 1', rules: [] }],
                duration_minutes: 60,
                shuffle_questions: false
            },
            validation: null,
            error: null
        });
    }
}));

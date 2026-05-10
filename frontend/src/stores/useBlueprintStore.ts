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

export interface GradeBoundary {
    min_percentage: number;
    grade: string;
}

export interface ScoringConfig {
    pass_percentage: number;
    negative_marking: boolean;
    negative_marking_penalty: number;
    multiple_response_strategy: 'ALL_OR_NOTHING' | 'PARTIAL_CREDIT';
    grade_boundaries: GradeBoundary[];
    essay_points: Record<string, number>; // learning_object_id -> max points
    shuffle_options: boolean;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
    pass_percentage: 55,
    negative_marking: false,
    negative_marking_penalty: 0.25,
    multiple_response_strategy: 'PARTIAL_CREDIT',
    grade_boundaries: [
        { min_percentage: 55, grade: 'Pass' },
        { min_percentage: 0, grade: 'Fail' },
    ],
    essay_points: {},
    shuffle_options: false,
};

export interface TestDefinition {
    id: string;
    title: string;
    description?: string;
    blocks: TestBlock[];
    duration_minutes: number;
    shuffle_questions: boolean;
    scoring_config?: ScoringConfig;
    created_at: string;
    updated_at: string;
}

export type BlueprintSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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

export interface BlueprintUsage {
    has_scheduled_sessions: boolean;
    has_past_sessions: boolean;
    is_locked: boolean;
    is_permanently_locked: boolean;
}

interface BlueprintState {
    blueprints: TestDefinition[];
    currentBlueprint: Partial<TestDefinition> | null;
    savedSnapshot: string | null;
    availableItems: AvailableItem[];
    isLoading: boolean;
    error: string | null;
    saveStatus: BlueprintSaveStatus;
    lastEditingId: string | null;
    viewMode: 'list' | 'editor';
    usageMap: Record<string, BlueprintUsage>;

    fetchBlueprints: () => Promise<void>;
    fetchBlueprint: (id: string) => Promise<void>;
    fetchAvailableItems: () => Promise<void>;
    saveBlueprint: (data: Partial<TestDefinition>) => Promise<string>;
    deleteBlueprint: (id: string) => Promise<void>;
    duplicateBlueprint: (id: string) => Promise<string>;
    resetCurrent: () => void;
    resetSaveStatus: () => void;
    setLastEditingId: (id: string | null) => void;
    setViewMode: (mode: 'list' | 'editor') => void;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
    return (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;
}

export const useBlueprintStore = create<BlueprintState>((set, get) => ({
    blueprints: [],
    currentBlueprint: null,
    savedSnapshot: null,
    availableItems: [],
    isLoading: false,
    error: null,
    saveStatus: 'idle',
    lastEditingId: null,
    viewMode: 'list',
    usageMap: {},

    fetchAvailableItems: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get<AvailableItem[]>('learning-objects');
            set({ availableItems: response.data, isLoading: false });
        } catch (err: unknown) {
            set({ error: getApiErrorMessage(err, 'Failed to fetch items'), isLoading: false });
        }
    },

    fetchBlueprints: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get<TestDefinition[]>('tests/');
            const blueprints = response.data;
            set({ blueprints, isLoading: false });
            // Fetch usage for all blueprints in parallel
            const usageEntries = await Promise.all(
                blueprints.map(async (bp) => {
                    try {
                        const u = await api.get<BlueprintUsage>(`tests/${bp.id}/usage`);
                        return [bp.id, u.data] as [string, BlueprintUsage];
                    } catch {
                        return [bp.id, { has_scheduled_sessions: false, has_past_sessions: false, is_locked: false, is_permanently_locked: false }] as [string, BlueprintUsage];
                    }
                })
            );
            set({ usageMap: Object.fromEntries(usageEntries) });
        } catch (err: unknown) {
            set({ error: getApiErrorMessage(err, 'Failed to fetch blueprints'), isLoading: false });
        }
    },

    fetchBlueprint: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get<TestDefinition>(`tests/${id}`);
            const snapshot = JSON.stringify(response.data);
            set({ currentBlueprint: response.data, savedSnapshot: snapshot, isLoading: false });
        } catch (err: unknown) {
            set({ error: getApiErrorMessage(err, 'Failed to fetch blueprint'), isLoading: false });
        }
    },

    saveBlueprint: async (data: Partial<TestDefinition>) => {
        set({ isLoading: true, error: null, saveStatus: 'saving' });
        try {
            let response;
            if (data.id) {
                response = await api.put<TestDefinition>(`tests/${data.id}`, data);
            } else {
                response = await api.post<TestDefinition>('tests/', data);
            }
            const snapshot = JSON.stringify(response.data);
            set({ currentBlueprint: response.data, savedSnapshot: snapshot, isLoading: false, saveStatus: 'saved' });
            return response.data.id;
        } catch (err: unknown) {
            const msg = getApiErrorMessage(err, 'Failed to save blueprint');
            set({ error: msg, isLoading: false, saveStatus: 'error' });
            throw new Error(msg);
        }
    },

    deleteBlueprint: async (id: string) => {
        await api.delete(`tests/${id}`);
        set((state) => ({
            blueprints: state.blueprints.filter((bp) => bp.id !== id),
        }));
    },

    duplicateBlueprint: async (id: string) => {
        const response = await api.post<{ id: string }>(`tests/${id}/duplicate`);
        await get().fetchBlueprints();
        return response.data.id;
    },

    resetCurrent: () => {
        set({
            currentBlueprint: {
                title: '',
                description: '',
                blocks: [{ title: 'Section 1', rules: [] }],
                duration_minutes: 60,
                shuffle_questions: false,
                scoring_config: { ...DEFAULT_SCORING_CONFIG },
            },
            savedSnapshot: null,
            error: null,
            saveStatus: 'idle',
        });
    },

    resetSaveStatus: () => set({ saveStatus: 'idle' }),
    setLastEditingId: (id) => set({ lastEditingId: id }),
    setViewMode: (mode) => set({ viewMode: mode }),
}));

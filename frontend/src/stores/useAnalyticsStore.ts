import { create } from 'zustand';

import {
    fetchCutScoreScenarios,
    fetchFlaggedItems,
    fetchItemHistory,
    fetchTestAnalytics,
    recomputeTestAnalytics,
} from '../lib/analytics';
import type {
    CutScoreScenario,
    ItemAnalyticsHistory,
    ItemAnalyticsResponse,
    TestAnalyticsBundle,
} from '../lib/analytics.types';

type AnalyticsStatus = 'idle' | 'loading' | 'ready' | 'error';

const ANALYTICS_TTL_MS = 30_000;

interface AnalyticsState {
    bundles: Record<string, TestAnalyticsBundle | undefined>;
    flagged: Record<string, ItemAnalyticsResponse[] | undefined>;
    itemHistories: Record<string, ItemAnalyticsHistory | undefined>;
    scenarios: Record<string, CutScoreScenario[] | undefined>;
    lastLoadedAt: Record<string, number | undefined>;
    status: AnalyticsStatus;
    error: string | null;
    loadTestAnalytics: (testId: string, force?: boolean) => Promise<void>;
    recompute: (testId: string) => Promise<void>;
    loadFlaggedItems: (testId: string) => Promise<void>;
    loadItemHistory: (loId: string) => Promise<void>;
    runCutScoreScenarios: (testId: string, cuts: number[]) => Promise<void>;
    clearError: () => void;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
    return (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
    bundles: {},
    flagged: {},
    itemHistories: {},
    scenarios: {},
    lastLoadedAt: {},
    status: 'idle',
    error: null,

    loadTestAnalytics: async (testId: string, force = false) => {
        const existing = get().lastLoadedAt[testId];
        if (!force && existing && Date.now() - existing < ANALYTICS_TTL_MS) {
            return;
        }

        set({ status: 'loading', error: null });
        try {
            const bundle = await fetchTestAnalytics(testId);
            set((state) => ({
                bundles: {
                    ...state.bundles,
                    [testId]: bundle,
                },
                lastLoadedAt: {
                    ...state.lastLoadedAt,
                    [testId]: Date.now(),
                },
                status: 'ready',
            }));
        } catch (error) {
            set({
                status: 'error',
                error: getApiErrorMessage(error, 'Failed to load test analytics.'),
            });
        }
    },

    recompute: async (testId: string) => {
        set({ status: 'loading', error: null });
        try {
            const bundle = await recomputeTestAnalytics(testId);
            set((state) => ({
                bundles: {
                    ...state.bundles,
                    [testId]: bundle,
                },
                flagged: {
                    ...state.flagged,
                    [testId]: bundle.items.filter((item) => item.flags.length > 0),
                },
                lastLoadedAt: {
                    ...state.lastLoadedAt,
                    [testId]: Date.now(),
                },
                status: 'ready',
            }));
        } catch (error) {
            set({
                status: 'error',
                error: getApiErrorMessage(error, 'Failed to recompute analytics.'),
            });
        }
    },

    loadFlaggedItems: async (testId: string) => {
        set({ status: 'loading', error: null });
        try {
            const items = await fetchFlaggedItems(testId);
            set((state) => ({
                flagged: {
                    ...state.flagged,
                    [testId]: items,
                },
                status: 'ready',
            }));
        } catch (error) {
            set({
                status: 'error',
                error: getApiErrorMessage(error, 'Failed to load flagged items.'),
            });
        }
    },

    loadItemHistory: async (loId: string) => {
        set({ status: 'loading', error: null });
        try {
            const history = await fetchItemHistory(loId);
            set((state) => ({
                itemHistories: {
                    ...state.itemHistories,
                    [loId]: history,
                },
                status: 'ready',
            }));
        } catch (error) {
            set({
                status: 'error',
                error: getApiErrorMessage(error, 'Failed to load item history.'),
            });
        }
    },

    runCutScoreScenarios: async (testId: string, cuts: number[]) => {
        set({ status: 'loading', error: null });
        try {
            const scenarios = await fetchCutScoreScenarios(testId, cuts);
            set((state) => ({
                scenarios: {
                    ...state.scenarios,
                    [testId]: scenarios,
                },
                status: 'ready',
            }));
        } catch (error) {
            set({
                status: 'error',
                error: getApiErrorMessage(error, 'Failed to run cut score scenarios.'),
            });
        }
    },

    clearError: () => set({ error: null }),
}));

import { create } from 'zustand';

import {
    fetchAnalyticsRuns,
    fetchCutScoreScenarios,
    fetchFlaggedItems,
    fetchItemHistory,
    fetchTestAnalytics,
    recomputeTestAnalytics,
    type AnalyticsRun,
} from '../lib/analytics';
import type {
    CutScoreScenario,
    ItemAnalyticsHistory,
    ItemAnalyticsResponse,
    TestAnalyticsBundle,
} from '../lib/analytics.types';

type AnalyticsStatus = 'idle' | 'loading' | 'ready' | 'error';

const ANALYTICS_TTL_MS = 30_000;

/**
 * Cache key for the per-(test, run) caches. ``null`` runId means combined
 * — the default analytics view across all runs of the test.
 */
function bundleKey(testId: string, runId: string | null = null): string {
    return `${testId}:${runId ?? 'combined'}`;
}

interface AnalyticsState {
    bundles: Record<string, TestAnalyticsBundle | undefined>;
    flagged: Record<string, ItemAnalyticsResponse[] | undefined>;
    itemHistories: Record<string, ItemAnalyticsHistory | undefined>;
    scenarios: Record<string, CutScoreScenario[] | undefined>;
    runsByTestId: Record<string, AnalyticsRun[] | undefined>;
    lastLoadedAt: Record<string, number | undefined>;
    status: AnalyticsStatus;
    error: string | null;
    lastTestId: string | null;
    loadTestAnalytics: (testId: string, runId?: string | null, force?: boolean) => Promise<void>;
    recompute: (testId: string, runId?: string | null) => Promise<void>;
    loadFlaggedItems: (testId: string, runId?: string | null) => Promise<void>;
    loadItemHistory: (loId: string) => Promise<void>;
    loadAnalyticsRuns: (testId: string) => Promise<void>;
    runCutScoreScenarios: (testId: string, cuts: number[], runId?: string | null) => Promise<void>;
    clearError: () => void;
    setLastTestId: (id: string | null) => void;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
    return (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
    bundles: {},
    flagged: {},
    itemHistories: {},
    scenarios: {},
    runsByTestId: {},
    lastLoadedAt: {},
    status: 'idle',
    error: null,
    lastTestId: null,

    loadTestAnalytics: async (testId, runId = null, force = false) => {
        const key = bundleKey(testId, runId);
        const existing = get().lastLoadedAt[key];
        if (!force && existing && Date.now() - existing < ANALYTICS_TTL_MS) {
            return;
        }

        set({ status: 'loading', error: null });
        try {
            const bundle = await fetchTestAnalytics(testId, runId);
            set((state) => ({
                bundles: { ...state.bundles, [key]: bundle },
                lastLoadedAt: { ...state.lastLoadedAt, [key]: Date.now() },
                status: 'ready',
            }));
        } catch (error) {
            set({
                status: 'error',
                error: getApiErrorMessage(error, 'Failed to load test analytics.'),
            });
        }
    },

    recompute: async (testId, runId = null) => {
        const key = bundleKey(testId, runId);
        set({ status: 'loading', error: null });
        try {
            const bundle = await recomputeTestAnalytics(testId, runId);
            set((state) => ({
                bundles: { ...state.bundles, [key]: bundle },
                flagged: {
                    ...state.flagged,
                    [key]: bundle.items.filter((item) => item.flags.length > 0),
                },
                lastLoadedAt: { ...state.lastLoadedAt, [key]: Date.now() },
                status: 'ready',
            }));
        } catch (error) {
            set({
                status: 'error',
                error: getApiErrorMessage(error, 'Failed to recompute analytics.'),
            });
        }
    },

    loadFlaggedItems: async (testId, runId = null) => {
        const key = bundleKey(testId, runId);
        set({ status: 'loading', error: null });
        try {
            const items = await fetchFlaggedItems(testId, runId);
            set((state) => ({
                flagged: { ...state.flagged, [key]: items },
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
                itemHistories: { ...state.itemHistories, [loId]: history },
                status: 'ready',
            }));
        } catch (error) {
            set({
                status: 'error',
                error: getApiErrorMessage(error, 'Failed to load item history.'),
            });
        }
    },

    loadAnalyticsRuns: async (testId: string) => {
        set({ error: null });
        try {
            const runs = await fetchAnalyticsRuns(testId);
            set((state) => ({
                runsByTestId: { ...state.runsByTestId, [testId]: runs },
            }));
        } catch (error) {
            set({
                error: getApiErrorMessage(error, 'Failed to load analytics runs.'),
            });
        }
    },

    runCutScoreScenarios: async (testId, cuts, runId = null) => {
        const key = bundleKey(testId, runId);
        set({ status: 'loading', error: null });
        try {
            const scenarios = await fetchCutScoreScenarios(testId, cuts, runId);
            set((state) => ({
                scenarios: { ...state.scenarios, [key]: scenarios },
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
    setLastTestId: (id) => set({ lastTestId: id }),
}));

// Re-export so consumers can read `bundles[bundleKey(testId, runId)]` etc.
export { bundleKey };

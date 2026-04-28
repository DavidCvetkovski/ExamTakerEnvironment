import { api } from './api';
import type {
    CutScoreScenario,
    ItemAnalyticsHistory,
    ItemAnalyticsResponse,
    TestAnalyticsBundle,
} from './analytics.types';

function buildCutScoreQuery(cuts: number[]): string {
    return cuts.join(',');
}

export async function fetchTestAnalytics(testId: string): Promise<TestAnalyticsBundle> {
    const response = await api.get<TestAnalyticsBundle>(`analytics/tests/${testId}`);
    return response.data;
}

export async function recomputeTestAnalytics(testId: string): Promise<TestAnalyticsBundle> {
    const response = await api.post<TestAnalyticsBundle>(`analytics/tests/${testId}/recompute`);
    return response.data;
}

export async function fetchFlaggedItems(testId: string): Promise<ItemAnalyticsResponse[]> {
    const response = await api.get<ItemAnalyticsResponse[]>(`analytics/tests/${testId}/flagged-items`);
    return response.data;
}

export async function fetchItemHistory(loId: string): Promise<ItemAnalyticsHistory> {
    const response = await api.get<ItemAnalyticsHistory>(`analytics/items/${loId}/history`);
    return response.data;
}

export async function fetchCutScoreScenarios(
    testId: string,
    cuts: number[],
): Promise<CutScoreScenario[]> {
    const response = await api.get<CutScoreScenario[]>(
        `analytics/tests/${testId}/cut-score-scenarios`,
        {
            params: {
                cuts: buildCutScoreQuery(cuts),
            },
        },
    );
    return response.data;
}

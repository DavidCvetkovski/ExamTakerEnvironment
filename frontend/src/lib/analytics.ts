/**
 * Analytics API bridge.
 * Maps the live-compute endpoints (Epoch 7 backend) to the type shapes
 * the analytics store and UI components expect.
 */
import { api } from './api';
import type {
    CutScoreScenario,
    ItemAnalyticsHistory,
    ItemAnalyticsResponse,
    TestAnalyticsBundle,
} from './analytics.types';

// ─── Internal response shapes (matching actual backend) ───────────────────────

interface BackendTestStats {
    test_definition_id: string;
    total_sessions: number;
    distribution: { range: string; min: number; max: number; count: number }[];
    mean: number | null;
    median: number | null;
    std_dev: number | null;
    min_score: number | null;
    max_score: number | null;
    pass_rate: number | null;
    pass_count: number;
    fail_count: number;
    cronbach_alpha: number | null;
    sem: number | null;
    n_items: number;
    cut_score_analysis: CutScoreScenario[];
}

interface BackendItemStats {
    test_definition_id: string;
    total_sessions: number;
    items: ItemAnalyticsResponse[];
}

interface BackendVersionHistory {
    learning_object_id: string;
    versions: {
        item_version_id: string;
        version_number: number | null;
        test_definition_ids: string[];
        p_value: number | null;
        d_value: number | null;
        n_responses: number;
        flags: { code: string; message: string }[];
    }[];
}

// ─── Public fetch functions ───────────────────────────────────────────────────

export async function fetchTestAnalytics(
    testId: string,
    runId: string | null = null,
): Promise<TestAnalyticsBundle> {
    const params = runId ? { run_id: runId } : undefined;
    const [statsRes, itemsRes] = await Promise.all([
        api.get<BackendTestStats>(`analytics/tests/${testId}/stats`, { params }),
        api.get<BackendItemStats>(`analytics/tests/${testId}/item-stats`, { params }),
    ]);

    const items: ItemAnalyticsResponse[] = itemsRes.data.items.map((item) => ({
        ...item,
        mean_score: item.mean_score !== undefined ? item.mean_score : null,
        points_possible: item.points_possible !== undefined ? item.points_possible : null,
        computed_at: item.computed_at !== undefined ? item.computed_at : null,
    }));

    return {
        test: {
            ...statsRes.data,
            cut_score: 55,
            computed_at: new Date().toISOString(),
            is_stale: false,
        },
        items,
        flagged_items_count: items.filter((i) => i.flags.length > 0).length,
    };
}

// Our API recomputes live on every call — recompute is the same as fetch.
export async function recomputeTestAnalytics(
    testId: string,
    runId: string | null = null,
): Promise<TestAnalyticsBundle> {
    return fetchTestAnalytics(testId, runId);
}

export async function fetchFlaggedItems(
    testId: string,
    runId: string | null = null,
): Promise<ItemAnalyticsResponse[]> {
    const params = runId ? { run_id: runId } : undefined;
    const res = await api.get<{ items: ItemAnalyticsResponse[] }>(
        `analytics/tests/${testId}/flagged-items`,
        { params },
    );
    return (res.data.items ?? []).map((item) => ({
        ...item,
        mean_score: item.mean_score !== undefined ? item.mean_score : null,
        points_possible: item.points_possible !== undefined ? item.points_possible : null,
        computed_at: item.computed_at !== undefined ? item.computed_at : null,
    }));
}

export async function fetchItemHistory(loId: string): Promise<ItemAnalyticsHistory> {
    const res = await api.get<BackendVersionHistory>(
        `analytics/items/${loId}/version-history`
    );

    return {
        learning_object_id: res.data.learning_object_id,
        entries: res.data.versions.map((v) => ({
            item_version_id: v.item_version_id,
            version_number: v.version_number,
            // Use first associated test as the canonical one for display
            test_definition_id: v.test_definition_ids[0] ?? '',
            test_title: v.test_definition_ids.length > 0
                ? `Test ${v.test_definition_ids[0].slice(0, 8)}`
                : 'Unknown test',
            p_value: v.p_value,
            d_value: v.d_value,
            n_responses: v.n_responses,
            computed_at: null,
            flags: v.flags,
        })),
    };
}

export async function fetchCutScoreScenarios(
    testId: string,
    cuts: number[],
    runId: string | null = null,
): Promise<CutScoreScenario[]> {
    const params: Record<string, string> = { cut_scores: cuts.join(',') };
    if (runId) params.run_id = runId;
    const res = await api.get<BackendTestStats>(
        `analytics/tests/${testId}/stats`,
        { params },
    );
    return res.data.cut_score_analysis;
}

/**
 * Per-run aggregates for the analytics runs picker. Includes the pinned
 * "Combined" sentinel row marked is_recommended_default=true.
 */
export interface AnalyticsRun {
    run_id: string;
    kind: 'COMBINED' | 'ASSIGNED';
    course_id: string | null;
    course_code: string | null;
    course_title: string | null;
    starts_at: string | null;
    ends_at: string | null;
    lifecycle_status: 'SCHEDULED' | 'ACTIVE' | 'CLOSED' | 'CANCELED';
    submissions_total: number;
    is_recommended_default: boolean;
}

export async function fetchAnalyticsRuns(testId: string): Promise<AnalyticsRun[]> {
    const res = await api.get<AnalyticsRun[]>(`analytics/tests/${testId}/runs`);
    return res.data ?? [];
}

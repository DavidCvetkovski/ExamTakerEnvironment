export interface DistractorStat {
    option_index: number;
    option_text: string | null;
    count: number;
    percentage: number;
    is_correct: boolean;
    is_non_functional: boolean;
}

export interface ItemFlag {
    code: string;
    message: string;
}

export interface ItemAnalyticsResponse {
    learning_object_id: string;
    item_version_id: string;
    version_number: number | null;
    question_type: string | null;
    p_value: number | null;
    d_value: number | null;
    n_responses: number;
    mean_score: number | null;
    points_possible: number | null;
    distractors: DistractorStat[];
    flags: ItemFlag[];
    computed_at: string | null;
}

export interface HistogramBucket {
    range: string;
    min: number;
    max: number;
    count: number;
}

export interface CutScoreScenario {
    cut_score: number;
    pass_count: number;
    fail_count: number;
    pass_rate: number;
}

export interface TestAnalyticsResponse {
    test_definition_id: string;
    total_sessions: number;
    distribution: HistogramBucket[];
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
    cut_score: number | null;
    computed_at: string | null;
    is_stale: boolean;
    cut_score_analysis: CutScoreScenario[];
}

export interface TestAnalyticsBundle {
    test: TestAnalyticsResponse;
    items: ItemAnalyticsResponse[];
    flagged_items_count: number;
}

export interface ItemHistoryEntry {
    item_version_id: string;
    version_number: number | null;
    test_definition_id: string;
    test_title: string;
    p_value: number | null;
    d_value: number | null;
    n_responses: number;
    computed_at: string | null;
    flags: ItemFlag[];
}

export interface ItemAnalyticsHistory {
    learning_object_id: string;
    entries: ItemHistoryEntry[];
}

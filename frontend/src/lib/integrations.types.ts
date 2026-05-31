// Shared types for the Epoch 12 integrations surface (LTI / SIS / QTI).

export interface LtiPlatform {
    id: string;
    name: string;
    issuer: string;
    client_id: string;
    auth_login_url: string;
    auth_token_url: string;
    auth_jwks_url: string;
    deployment_ids: string[];
    is_active: boolean;
}

export interface LtiPlatformCreate {
    name: string;
    issuer: string;
    client_id: string;
    auth_login_url: string;
    auth_token_url: string;
    auth_jwks_url: string;
    deployment_ids: string[];
}

export interface LtiContextLink {
    id: string;
    context_id: string;
    title: string | null;
    course_id: string | null;
    course_code: string | null;
}

export interface LtiResourceLink {
    id: string;
    resource_link_id: string;
    title: string | null;
    scheduled_session_id: string | null;
    test_definition_id: string | null;
}

export interface GradePassback {
    id: string;
    session_result_id: string;
    status: string;
    score_given: number | null;
    score_maximum: number | null;
    attempts: number;
    pushed_at: string | null;
    last_error: string | null;
}

export interface SisImportRowResult {
    row_number: number;
    status: string;
    message: string | null;
}

export interface SisImportJobResult {
    job_id: string;
    status: string;
    total_rows: number;
    success_rows: number;
    error_rows: number;
    rows: SisImportRowResult[];
}

export interface QtiImportItemResult {
    identifier: string;
    status: string;
    question_type: string | null;
    message: string | null;
}

export interface QtiImportJobResult {
    job_id: string;
    status: string;
    committed: boolean;
    total_items: number;
    success_items: number;
    error_items: number;
    items: QtiImportItemResult[];
}

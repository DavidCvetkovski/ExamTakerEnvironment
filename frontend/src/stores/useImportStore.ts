import { create } from 'zustand';
import { api } from '@/lib/api';

export interface ParseError {
    line: number | null;
    message: string;
    severity: 'error' | 'warning';
    fix_hint: string | null;
}

export interface PreviewBlock {
    name: string;
    question_count: number;
    question_summaries: string[];
}

export interface ImportPreviewResult {
    question_count: number;
    block_count: number;
    has_blueprint_header: boolean;
    blueprint_title: string | null;
    errors: ParseError[];
    warnings: ParseError[];
    blocks: PreviewBlock[];
    can_commit: boolean;
}

export interface ImportCommitResult {
    status: string;
    created_lo_ids: string[];
    blueprint_id: string | null;
    question_count: number;
    warnings: ParseError[];
}

export interface ItemBank {
    id: string;
    name: string;
}

interface ImportState {
    rawText: string;
    bankId: string | null;
    banks: ItemBank[];
    createBlueprint: boolean;
    previewResult: ImportPreviewResult | null;
    previewLoading: boolean;
    previewError: string | null;
    commitStatus: 'idle' | 'running' | 'completed' | 'failed';
    commitResult: ImportCommitResult | null;
    commitError: string | null;

    setRawText: (text: string) => void;
    setBankId: (id: string | null) => void;
    setCreateBlueprint: (v: boolean) => void;
    fetchBanks: () => Promise<void>;
    fetchPreview: () => Promise<void>;
    commitImport: () => Promise<void>;
    reset: () => void;
}

function apiErrorMessage(err: unknown, fallback: string): string {
    const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    if (Array.isArray(detail)) return detail.map((e: { message?: string }) => e.message).join('; ');
    if (typeof detail === 'string') return detail;
    return fallback;
}

export const useImportStore = create<ImportState>((set, get) => ({
    rawText: '',
    bankId: null,
    banks: [],
    createBlueprint: true,
    previewResult: null,
    previewLoading: false,
    previewError: null,
    commitStatus: 'idle',
    commitResult: null,
    commitError: null,

    setRawText: (text) => set({ rawText: text, previewResult: null, previewError: null }),
    setBankId: (id) => set({ bankId: id }),
    setCreateBlueprint: (v) => set({ createBlueprint: v }),

    fetchBanks: async () => {
        try {
            const res = await api.get<ItemBank[]>('import/banks');
            const banks = res.data;
            set({ banks });
            if (banks.length > 0 && !get().bankId) {
                set({ bankId: banks[0].id });
            }
        } catch {
            // silently fail — user can still type manually
        }
    },

    fetchPreview: async () => {
        const { rawText } = get();
        if (!rawText.trim()) return;
        set({ previewLoading: true, previewError: null, previewResult: null });
        try {
            const res = await api.post<ImportPreviewResult>('import/preview', { raw_text: rawText });
            set({ previewResult: res.data, previewLoading: false });
        } catch (err) {
            set({ previewError: apiErrorMessage(err, 'Preview failed'), previewLoading: false });
        }
    },

    commitImport: async () => {
        const { rawText, bankId, createBlueprint } = get();
        if (!bankId) return;
        set({ commitStatus: 'running', commitError: null });
        try {
            const res = await api.post<ImportCommitResult>('import/commit', {
                raw_text: rawText,
                bank_id: bankId,
                create_blueprint: createBlueprint,
            });
            set({ commitStatus: 'completed', commitResult: res.data });
        } catch (err) {
            set({ commitStatus: 'failed', commitError: apiErrorMessage(err, 'Commit failed') });
        }
    },

    reset: () => set({
        rawText: '',
        bankId: null,
        createBlueprint: true,
        previewResult: null,
        previewLoading: false,
        previewError: null,
        commitStatus: 'idle',
        commitResult: null,
        commitError: null,
    }),
}));

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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

interface ImportState {
    rawText: string;
    createBlueprint: boolean;
    previewResult: ImportPreviewResult | null;
    previewLoading: boolean;
    previewError: string | null;
    commitStatus: 'idle' | 'running' | 'completed' | 'failed';
    commitResult: ImportCommitResult | null;
    commitError: string | null;

    setRawText: (text: string) => void;
    setCreateBlueprint: (v: boolean) => void;
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

export const useImportStore = create<ImportState>()(
    persist(
        (set, get) => ({
            rawText: '',
            createBlueprint: true,
            previewResult: null,
            previewLoading: false,
            previewError: null,
            commitStatus: 'idle' as const,
            commitResult: null,
            commitError: null,

            setRawText: (text) => set({ rawText: text, previewResult: null, previewError: null }),
            setCreateBlueprint: (v) => set({ createBlueprint: v }),

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
                const { rawText, createBlueprint } = get();
                set({ commitStatus: 'running', commitError: null });
                try {
                    const res = await api.post<ImportCommitResult>('import/commit', {
                        raw_text: rawText,
                        create_blueprint: createBlueprint,
                    });
                    set({ commitStatus: 'completed', commitResult: res.data });
                } catch (err) {
                    set({ commitStatus: 'failed', commitError: apiErrorMessage(err, 'Commit failed') });
                }
            },

            reset: () => set({
                rawText: '',
                createBlueprint: true,
                previewResult: null,
                previewLoading: false,
                previewError: null,
                commitStatus: 'idle',
                commitResult: null,
                commitError: null,
            }),
        }),
        {
            name: 'openvision-import-draft',
            storage: createJSONStorage(() => sessionStorage),
            partialize: (s) => ({ rawText: s.rawText, createBlueprint: s.createBlueprint }),
        }
    )
);

import { create } from 'zustand';
import { api } from '../lib/api';

export interface AccommodationStudent {
    id: string;
    email: string;
    vunet_id: string | null;
    provision_time_multiplier: number;
    accommodation_enlarged_display: boolean;
}

export interface AuditEntry {
    id: string;
    student_id: string;
    changed_by: string;
    field: string;
    old_value: string;
    new_value: string;
    source: string;
    created_at: string;
}

export interface ImportRowResult {
    row: number;
    vunet_id: string;
    status: string;
    message?: string | null;
}

export interface ImportResult {
    applied: number;
    unchanged: number;
    errors: number;
    rows: ImportRowResult[];
}

interface AccommodationUpdate {
    provision_time_multiplier?: number;
    enlarged_display?: boolean;
}

const PAGE_SIZE = 50;

interface AccommodationsState {
    students: AccommodationStudent[];
    total: number;
    skip: number;
    search: string;
    isLoading: boolean;

    audit: AuditEntry[];
    auditLoading: boolean;

    fetchStudents: (opts?: { skip?: number; search?: string }) => Promise<void>;
    setSearch: (search: string) => void;
    updateStudent: (studentId: string, patch: AccommodationUpdate) => Promise<AccommodationStudent>;
    fetchAudit: (studentId: string) => Promise<void>;
    importCsv: (file: File) => Promise<ImportResult>;
}

export const PAGE_LIMIT = PAGE_SIZE;

export const useAccommodationsStore = create<AccommodationsState>((set, get) => ({
    students: [],
    total: 0,
    skip: 0,
    search: '',
    isLoading: false,
    audit: [],
    auditLoading: false,

    fetchStudents: async (opts) => {
        const skip = opts?.skip ?? get().skip;
        const search = opts?.search ?? get().search;
        set({ isLoading: true });
        try {
            const resp = await api.get('accommodations/students', {
                params: { skip, limit: PAGE_SIZE, search: search || undefined },
            });
            set({
                students: resp.data.items,
                total: resp.data.total,
                skip,
                search,
                isLoading: false,
            });
        } catch (error) {
            set({ isLoading: false });
            throw error;
        }
    },

    setSearch: (search) => set({ search }),

    updateStudent: async (studentId, patch) => {
        const resp = await api.patch(`accommodations/students/${studentId}`, patch);
        const updated: AccommodationStudent = resp.data;
        // Reflect the change in the loaded list without a refetch.
        set((s) => ({
            students: s.students.map((st) => (st.id === studentId ? updated : st)),
        }));
        return updated;
    },

    fetchAudit: async (studentId) => {
        set({ auditLoading: true, audit: [] });
        try {
            const resp = await api.get(`accommodations/students/${studentId}/audit`, {
                params: { skip: 0, limit: PAGE_SIZE },
            });
            set({ audit: resp.data.items, auditLoading: false });
        } catch (error) {
            set({ auditLoading: false });
            throw error;
        }
    },

    importCsv: async (file) => {
        const form = new FormData();
        form.append('file', file);
        const resp = await api.post('accommodations/import', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        // Refresh the visible page so applied changes show.
        await get().fetchStudents();
        return resp.data as ImportResult;
    },
}));

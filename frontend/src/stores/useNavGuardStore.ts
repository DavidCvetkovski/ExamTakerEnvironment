import { create } from 'zustand';

/**
 * Global "page has unsaved work" flag (Epoch 8.4 Stage 18b).
 * The blueprint editor (and any future surface with dirty state) sets this
 * while edits are pending; GlobalHeader reads it to prompt before in-app nav.
 *
 * Browser-level tab close / refresh is handled by `beforeunload` inside the
 * editor itself — this store covers click-driven navigation that bypasses
 * that event.
 */
interface NavGuardState {
    /** True when the active page has unsaved changes the user shouldn't lose. */
    isDirty: boolean;
    /** Human-readable description of the work at risk. Shown in the prompt. */
    label: string;
    setDirty: (dirty: boolean, label?: string) => void;
}

export const useNavGuardStore = create<NavGuardState>((set) => ({
    isDirty: false,
    label: 'changes',
    setDirty: (dirty, label) =>
        set({ isDirty: dirty, label: label ?? 'changes' }),
}));

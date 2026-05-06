import { create } from 'zustand';

export type ToastTone = 'success' | 'info' | 'warning' | 'danger';

export interface ToastItem {
    id: string;
    tone: ToastTone;
    title: string;
    description?: string;
    duration?: number;
}

interface ToastState {
    toasts: ToastItem[];
    toast: (opts: Omit<ToastItem, 'id'>) => string;
    dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
    toasts: [],

    toast: (opts) => {
        const id = Math.random().toString(36).slice(2);
        const item: ToastItem = { ...opts, id, duration: opts.duration ?? 4000 };
        set((s) => ({ toasts: [...s.toasts.slice(-3), item] }));
        return id;
    },

    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function useToast(): Pick<ToastState, 'toast' | 'dismiss'> {
    const toast = useToastStore((s) => s.toast);
    const dismiss = useToastStore((s) => s.dismiss);
    return { toast, dismiss };
}

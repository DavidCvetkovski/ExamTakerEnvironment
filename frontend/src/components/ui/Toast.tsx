'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useToastStore, ToastItem, ToastTone } from './useToast';

const TONE_STYLES: Record<ToastTone, string> = {
    success: 'border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-fg)]',
    info: 'border-[var(--color-info-border)] bg-[var(--color-info-bg)] text-[var(--color-info-fg)]',
    warning: 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-fg)]',
    danger: 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)]',
};

const TONE_ICON: Record<ToastTone, string> = {
    success: '✓',
    info: 'i',
    warning: '!',
    danger: '✕',
};

function Toast({ toast }: { toast: ToastItem }) {
    const dismiss = useToastStore((s) => s.dismiss);

    useEffect(() => {
        const timer = setTimeout(() => dismiss(toast.id), toast.duration ?? 4000);
        return () => clearTimeout(timer);
    }, [toast.id, toast.duration, dismiss]);

    return (
        <div
            role="alert"
            aria-live="polite"
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-elevated backdrop-blur-sm transition-all duration-300 ${TONE_STYLES[toast.tone]}`}
            style={{ minWidth: 280, maxWidth: 360 }}
        >
            <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border border-current flex items-center justify-center text-xs font-bold">
                {TONE_ICON[toast.tone]}
            </span>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight">{toast.title}</p>
                {toast.description && (
                    <p className="mt-0.5 text-xs opacity-80 leading-snug">{toast.description}</p>
                )}
            </div>
            <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(toast.id)}
                className="flex-shrink-0 mt-0.5 opacity-60 hover:opacity-100 transition-opacity text-sm leading-none"
            >
                ×
            </button>
        </div>
    );
}

export function ToastProvider() {
    const toasts = useToastStore((s) => s.toasts);

    if (typeof window === 'undefined') return null;

    return createPortal(
        <div
            aria-label="Notifications"
            className="fixed top-4 right-4 z-[9999] flex flex-col gap-2"
        >
            {toasts.map((t) => (
                <Toast key={t.id} toast={t} />
            ))}
        </div>,
        document.body,
    );
}

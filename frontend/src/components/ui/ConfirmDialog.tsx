'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from './Button';

export interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'danger' | 'warning' | 'neutral';
}

interface ConfirmState {
    options: ConfirmOptions;
    resolve: (v: boolean) => void;
}

interface ConfirmDialogModalProps {
    options: ConfirmOptions;
    onClose: (value: boolean) => void;
}

function ConfirmDialogModal({ options, onClose }: ConfirmDialogModalProps) {
    const { title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'neutral' } = options;

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose(false);
            // Only confirm on Enter when focus is on a button — prevents accidental
            // confirmation if a future text field fires Enter.
            if (e.key === 'Enter' && e.target instanceof HTMLButtonElement) onClose(true);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const confirmVariant = tone === 'warning' ? 'warning' : 'primary';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
        >
            <div className="absolute inset-0 bg-[var(--color-overlay)] backdrop-blur-sm" onClick={() => onClose(false)} />
            <div className="relative z-10 w-full max-w-md rounded-2xl border border-shell-border bg-shell-surface shadow-elevated p-6 space-y-4">
                <h2 id="confirm-title" className="text-h3 font-semibold text-foreground">{title}</h2>
                <p className="text-body text-shell-muted leading-relaxed">{message}</p>
                <div className="flex justify-end gap-3 pt-2">
                    <Button variant="ghost" size="sm" onClick={() => onClose(false)}>
                        {cancelLabel}
                    </Button>
                    <Button
                        variant={tone === 'danger' ? 'destructive' : confirmVariant}
                        size="sm"
                        onClick={() => onClose(true)}
                    >
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}

export function useConfirm() {
    const [state, setState] = useState<ConfirmState | null>(null);

    const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => setState({ options, resolve }));
    }, []);

    const handleClose = useCallback((value: boolean) => {
        state?.resolve(value);
        setState(null);
    }, [state]);

    const ConfirmDialog = state ? (
        <ConfirmDialogModal options={state.options} onClose={handleClose} />
    ) : null;

    return { confirm, ConfirmDialog };
}

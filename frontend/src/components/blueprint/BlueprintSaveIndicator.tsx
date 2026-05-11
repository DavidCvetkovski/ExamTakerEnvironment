'use client';

import { useEffect } from 'react';

import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { Spinner } from '@/components/ui';

export default function BlueprintSaveIndicator() {
    const saveStatus = useBlueprintStore((state) => state.saveStatus);
    const error = useBlueprintStore((state) => state.error);
    const resetSaveStatus = useBlueprintStore((state) => state.resetSaveStatus);

    useEffect(() => {
        if (saveStatus !== 'saved') {
            return undefined;
        }

        const timer = window.setTimeout(() => resetSaveStatus(), 2200);
        return () => window.clearTimeout(timer);
    }, [resetSaveStatus, saveStatus]);

    if (saveStatus === 'idle') {
        return null;
    }

    if (saveStatus === 'saving') {
        return (
            <div className="flex items-center gap-3 text-brand" aria-live="polite">
                <Spinner size="xs" tone="current" />
                <span className="text-xs font-semibold uppercase tracking-medium">Saving blueprint</span>
            </div>
        );
    }

    if (saveStatus === 'saved') {
        return (
            <div className="flex items-center gap-3 text-[var(--color-success-fg)] motion-safe:animate-[pulse_0.6s_ease-out]" aria-live="polite">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-success-bg)]">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                </span>
                <span className="text-xs font-semibold uppercase tracking-medium">Blueprint saved</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3 text-danger motion-safe:animate-[ov-shake_0.35s_ease-in-out]" aria-live="polite">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-danger-bg)]">
                <span className="text-sm font-bold">!</span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-medium">
                {typeof error === 'string' ? error : 'Save failed'}
            </span>
        </div>
    );
}

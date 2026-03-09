'use client';

import { useEffect } from 'react';

import { useBlueprintStore } from '@/stores/useBlueprintStore';

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
        return (
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500" aria-live="polite">
                Ready
            </div>
        );
    }

    if (saveStatus === 'saving') {
        return (
            <div className="flex items-center gap-3 text-cyan-300" aria-live="polite">
                <span className="h-3 w-3 rounded-full border-2 border-cyan-300 border-t-transparent animate-spin" />
                <span className="text-xs font-semibold uppercase tracking-[0.24em]">Saving blueprint</span>
            </div>
        );
    }

    if (saveStatus === 'saved') {
        return (
            <div className="flex items-center gap-3 text-emerald-300 motion-safe:animate-[pulse_0.6s_ease-out]" aria-live="polite">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20">
                    <span className="text-sm font-bold">✓</span>
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.24em]">Blueprint saved</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3 text-rose-300 motion-safe:animate-[ov-shake_0.35s_ease-in-out]" aria-live="polite">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/20">
                <span className="text-sm font-bold">!</span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.24em]">
                {error || 'Save failed'}
            </span>
        </div>
    );
}

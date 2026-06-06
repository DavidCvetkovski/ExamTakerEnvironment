'use client';

import { useEffect, useRef } from 'react';

import { useExamStore, SaveStatus } from '@/stores/useExamStore';
import { Spinner, useAnnounce } from '@/components/ui';

/**
 * Small persistent badge showing heartbeat save status.
 * - idle: hidden
 * - saving: "Saving…" with spinner
 * - saved: "Saved" with check icon (auto-fades after 2s)
 * - error: "Save failed — retrying…" with cross icon
 */
function CheckIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.5L6.5 12L13 5" />
        </svg>
    );
}

function XIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l8 8M12 4l-8 8" />
        </svg>
    );
}

export default function SaveIndicator() {
    const saveStatus = useExamStore((s) => s.saveStatus);
    const announce = useAnnounce();
    const lastAnnounced = useRef<SaveStatus>('idle');

    // Voice save outcomes to screen-reader users (the badge is visual-only).
    useEffect(() => {
        if (saveStatus === lastAnnounced.current) return;
        lastAnnounced.current = saveStatus;
        if (saveStatus === 'saved') {
            announce('Answer saved');
        } else if (saveStatus === 'error') {
            announce('Save failed, retrying', 'assertive');
        }
    }, [saveStatus, announce]);

    if (saveStatus === 'idle') return null;

    const config: Record<Exclude<SaveStatus, 'idle'>, { text: string; color: string; icon: React.ReactNode }> = {
        saving: { text: 'Saving…', color: 'text-shell-muted', icon: <Spinner size="xs" tone="current" /> },
        saved: { text: 'Saved', color: 'text-[var(--color-success-fg)]', icon: <CheckIcon /> },
        error: { text: 'Save failed — retrying…', color: 'text-[var(--color-danger-fg)]', icon: <XIcon /> },
    };

    // saveStatus is guaranteed non-idle here (early return above).
    const { text, color, icon } = config[saveStatus as Exclude<SaveStatus, 'idle'>];

    return (
        <div
            className={`flex items-center gap-1.5 text-xs font-medium transition-opacity duration-300 ${color} opacity-100`}
        >
            {icon}
            <span>{text}</span>
        </div>
    );
}

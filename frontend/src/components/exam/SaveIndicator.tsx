'use client';

import { useExamStore, SaveStatus } from '@/stores/useExamStore';

/**
 * Small persistent badge showing heartbeat save status.
 * - idle: hidden
 * - saving: "Saving..." with animated dot
 * - saved: "Saved ✓" with green checkmark (auto-fades after 2s)
 * - error: "Save failed" with red indicator
 */
export default function SaveIndicator() {
    const saveStatus = useExamStore((s) => s.saveStatus);
    if (saveStatus === 'idle') return null;

    const config: Record<SaveStatus, { text: string; color: string; icon: string }> = {
        idle: { text: '', color: '', icon: '' },
        saving: { text: 'Saving...', color: 'text-gray-400', icon: '⟳' },
        saved: { text: 'Saved', color: 'text-emerald-400', icon: '✓' },
        error: { text: 'Save failed — retrying...', color: 'text-red-400', icon: '✗' },
    };

    const { text, color, icon } = config[saveStatus];

    return (
        <div
            className={`flex items-center gap-1.5 text-xs font-medium transition-opacity duration-300 ${color} opacity-100`}
        >
            <span className={saveStatus === 'saving' ? 'animate-spin' : ''}>{icon}</span>
            <span>{text}</span>
        </div>
    );
}

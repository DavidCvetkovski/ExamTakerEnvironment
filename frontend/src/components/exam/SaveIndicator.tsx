'use client';

import { useEffect, useState } from 'react';
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
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (saveStatus === 'saving' || saveStatus === 'error') {
            setVisible(true);
        } else if (saveStatus === 'saved') {
            setVisible(true);
            const timer = setTimeout(() => setVisible(false), 2500);
            return () => clearTimeout(timer);
        } else {
            setVisible(false);
        }
    }, [saveStatus]);

    if (!visible) return null;

    const config: Record<SaveStatus, { text: string; color: string; icon: string }> = {
        idle: { text: '', color: '', icon: '' },
        saving: { text: 'Saving...', color: 'text-gray-400', icon: '⟳' },
        saved: { text: 'Saved', color: 'text-emerald-400', icon: '✓' },
        error: { text: 'Save failed — retrying...', color: 'text-red-400', icon: '✗' },
    };

    const { text, color, icon } = config[saveStatus];

    return (
        <div
            className={`flex items-center gap-1.5 text-xs font-medium transition-opacity duration-300 ${color} ${visible ? 'opacity-100' : 'opacity-0'
                }`}
        >
            <span className={saveStatus === 'saving' ? 'animate-spin' : ''}>{icon}</span>
            <span>{text}</span>
        </div>
    );
}

'use client';

/**
 * Thin compatibility shim — delegates to the canonical UI StatCard.
 * Existing analytics callers pass `accent` (blue/emerald/amber/rose/slate);
 * map those to the UI primitive's `tone` taxonomy.
 */

import UIStatCard from '@/components/ui/StatCard';

type Accent = 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const ACCENT_TO_TONE: Record<Accent, Tone> = {
    blue: 'info',
    emerald: 'success',
    amber: 'warning',
    rose: 'danger',
    slate: 'neutral',
};

interface StatCardProps {
    label: string;
    value: string;
    note?: string;
    accent?: Accent;
}

export default function StatCard({ label, value, note, accent = 'slate' }: StatCardProps) {
    return <UIStatCard label={label} value={value} note={note} tone={ACCENT_TO_TONE[accent]} />;
}

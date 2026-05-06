'use client';

import { Badge } from '@/components/ui';

const FLAG_TONE: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
    TOO_EASY: 'info',
    TOO_HARD: 'danger',
    POOR_DISCRIMINATION: 'warning',
    NEGATIVE_DISCRIMINATION: 'danger',
    UNDERPERFORMING: 'danger',
    LATEST: 'neutral',
};

export default function FlagBadge({ code }: { code: string }) {
    const label = code.replaceAll('_', ' ');
    const tone = FLAG_TONE[code] ?? 'neutral';
    return <Badge tone={tone} size="sm">{label}</Badge>;
}

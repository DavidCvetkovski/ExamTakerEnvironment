// Presentation helpers for psychometric metrics. Keep formatting decisions in
// one place so the items table, section panel, and drill-down stay consistent.

/** P-value is stored 0–1; professors read it as a difficulty percentage. */
export function formatPercent(value: number | null): string {
    return value === null ? '—' : `${Math.round(value * 100)}%`;
}

/** D-value is a correlation-like index, not a percentage — keep two decimals. */
export function formatIndex(value: number | null): string {
    return value === null ? '—' : value.toFixed(2);
}

export type DiscriminationQuality = 'good' | 'weak' | 'poor';

export function discriminationQuality(value: number | null): DiscriminationQuality | null {
    if (value === null) return null;
    if (value >= 0.3) return 'good';
    if (value >= 0.15) return 'weak';
    return 'poor';
}

export const DISCRIMINATION_LABEL: Record<DiscriminationQuality, string> = {
    good: 'Good',
    weak: 'Weak',
    poor: 'Poor',
};

/** Theme-bound semantic colour for each quality tier. */
export const DISCRIMINATION_TONE: Record<DiscriminationQuality, string> = {
    good: 'var(--color-success-fg)',
    weak: 'var(--color-warning-fg)',
    poor: 'var(--color-danger-fg)',
};

'use client';

import { ReactNode } from 'react';
import { cn } from './cn';
import InfoTooltip from './InfoTooltip';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

interface StatCardProps {
    label: ReactNode;
    value: ReactNode;
    note?: ReactNode;
    tone?: Tone;
    /** Optional small SVG / glyph in the top-right corner */
    indicator?: ReactNode;
    /** Optional info tooltip content shown next to the label */
    info?: ReactNode;
    className?: string;
}

const TONE_VALUE: Record<Tone, string> = {
    neutral: 'text-foreground',
    success: 'text-[var(--color-success-fg)]',
    warning: 'text-[var(--color-warning-fg)]',
    danger: 'text-[var(--color-danger-fg)]',
    info: 'text-[var(--color-info-fg)]',
    accent: 'text-brand',
};

const TONE_RAIL: Record<Tone, string> = {
    neutral: 'bg-shell-border',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
    accent: 'bg-brand',
};

/**
 * Editorial-style stat card. Vertical accent rail on the left signals tone without shouting.
 * Numbers use tabular-nums for consistent column widths.
 */
export default function StatCard({
    label,
    value,
    note,
    tone = 'neutral',
    indicator,
    info,
    className,
}: StatCardProps) {
    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-xl bg-shell-surface border border-shell-border',
                'shadow-[var(--shadow-card)]',
                'transition-[border-color,box-shadow] duration-[var(--duration-normal)] ease-[var(--ease-standard)]',
                'hover:border-shell-border-deep',
                className
            )}
        >
            <span className={cn('absolute left-0 top-0 bottom-0 w-[3px]', TONE_RAIL[tone])} aria-hidden />
            <div className="px-5 py-5 pl-6">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                        <p className="text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim">
                            {label}
                        </p>
                        {info ? <InfoTooltip>{info}</InfoTooltip> : null}
                    </div>
                    {indicator && (
                        <span className="text-shell-muted-dim shrink-0">{indicator}</span>
                    )}
                </div>
                <p className={cn('mt-3 text-h1 tabular-nums', TONE_VALUE[tone])}>{value}</p>
                {note && (
                    <p className="mt-1.5 text-meta text-shell-muted-dim">{note}</p>
                )}
            </div>
        </div>
    );
}

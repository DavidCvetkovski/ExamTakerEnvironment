'use client';

import { ReactNode } from 'react';
import { cn } from './cn';

interface PageHeaderProps {
    eyebrow?: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    actions?: ReactNode;
    children?: ReactNode;
    className?: string;
    /** Tighter variant for inline (non-page-header) sections */
    compact?: boolean;
    /** Show a subtle divider beneath the header */
    divider?: boolean;
}

/**
 * Editorial page-header pattern: small caps eyebrow, h1, supporting subtitle, optional actions block.
 *
 * Used as the canonical header for every authenticated page.
 */
export default function PageHeader({
    eyebrow,
    title,
    subtitle,
    actions,
    children,
    className,
    compact,
    divider,
}: PageHeaderProps) {
    return (
        <header
            className={cn(
                'flex flex-col gap-4',
                compact ? 'pb-3' : 'pb-6',
                divider && 'border-b border-shell-border mb-6',
                className
            )}
        >
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
                <div className="min-w-0 flex-1">
                    {eyebrow && (
                        <p className="text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim mb-2">
                            {eyebrow}
                        </p>
                    )}
                    <h1
                        className={cn(
                            compact ? 'text-h1' : 'text-display',
                            'text-foreground',
                            'leading-[1.05]'
                        )}
                    >
                        {title}
                    </h1>
                    {subtitle && (
                        <p className={cn('text-body text-shell-muted mt-2 max-w-2xl')}>
                            {subtitle}
                        </p>
                    )}
                </div>
                {actions && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
                )}
            </div>
            {children}
        </header>
    );
}

/** Section heading — smaller hierarchy, used for in-page section breaks */
interface SectionHeaderProps {
    eyebrow?: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    actions?: ReactNode;
    className?: string;
}

export function SectionHeader({ eyebrow, title, subtitle, actions, className }: SectionHeaderProps) {
    return (
        <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-2 mb-4', className)}>
            <div className="min-w-0">
                {eyebrow && (
                    <p className="text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim mb-1.5">
                        {eyebrow}
                    </p>
                )}
                <h2 className="text-h2 text-foreground">{title}</h2>
                {subtitle && <p className="text-meta text-shell-muted mt-1">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
    );
}

'use client';

import { ReactNode } from 'react';
import { cn } from '@/components/ui';

type Width = 'narrow' | 'standard' | 'wide';
type Padding = 'standard' | 'compact';

interface PageShellProps {
    width?: Width;
    padding?: Padding;
    children: ReactNode;
    className?: string;
}

/**
 * Canonical page wrapper. Replaces hand-rolled `<div className="min-h-full bg-shell-bg">`
 * boilerplate. See CLAUDE.md §7.5 for width conventions.
 *
 * - narrow (max-w-4xl): forms, single-column reading (author, exam-take, home).
 * - standard (max-w-5xl): drill-down detail pages (grading session, my-results).
 * - wide (max-w-[1400px]): data tables and grids (items, sessions, grading, blueprints).
 *
 * Documented exceptions (do NOT use PageShell): /login, /exam/[id].
 */
const WIDTH: Record<Width, string> = {
    narrow: 'max-w-4xl',
    standard: 'max-w-5xl',
    wide: 'max-w-[1400px]',
};

const PADDING: Record<Padding, string> = {
    standard: 'py-8',
    compact: 'py-6',
};

export default function PageShell({
    width = 'wide',
    padding = 'standard',
    children,
    className,
}: PageShellProps) {
    return (
        <div className="min-h-full bg-shell-bg text-foreground">
            <div className={cn(
                WIDTH[width],
                'mx-auto px-4 sm:px-6 lg:px-8',
                PADDING[padding],
                className,
            )}>
                {children}
            </div>
        </div>
    );
}

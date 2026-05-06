'use client';

import { ReactNode } from 'react';
import { cn } from './cn';

interface EmptyStateProps {
    icon?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
    variant?: 'default' | 'compact';
}

export default function EmptyState({
    icon,
    title,
    description,
    action,
    className,
    variant = 'default',
}: EmptyStateProps) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center text-center',
                'rounded-xl border border-dashed border-shell-border',
                'bg-shell-input/30',
                variant === 'compact' ? 'px-6 py-10 gap-2' : 'px-8 py-16 gap-3',
                className
            )}
        >
            {icon && (
                <div className="text-shell-muted-dim mb-1 inline-flex items-center justify-center">
                    {icon}
                </div>
            )}
            <p className="text-h3 text-foreground font-semibold">{title}</p>
            {description && (
                <p className="text-meta text-shell-muted-dim max-w-md">{description}</p>
            )}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}

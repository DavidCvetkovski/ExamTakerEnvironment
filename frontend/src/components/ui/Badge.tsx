'use client';

import { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
type Variant = 'soft' | 'solid' | 'outline';
type Size = 'sm' | 'md';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    tone?: Tone;
    variant?: Variant;
    size?: Size;
    leadingIcon?: ReactNode;
    children?: ReactNode;
}

const SOFT: Record<Tone, string> = {
    neutral: 'bg-shell-input-alt text-shell-muted border border-shell-border',
    success: 'bg-[var(--color-success-bg)] text-[var(--color-success-fg)] border border-[var(--color-success-border)]',
    warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-fg)] border border-[var(--color-warning-border)]',
    danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] border border-[var(--color-danger-border)]',
    info: 'bg-[var(--color-info-bg)] text-[var(--color-info-fg)] border border-[var(--color-info-border)]',
    accent: 'bg-[color-mix(in_oklab,var(--color-brand)_12%,transparent)] text-brand border border-[color-mix(in_oklab,var(--color-brand)_30%,transparent)]',
};

const SOLID: Record<Tone, string> = {
    neutral: 'bg-shell-muted-dim text-shell-bg',
    success: 'bg-success text-white',
    warning: 'bg-warning text-white',
    danger: 'bg-danger text-white',
    info: 'bg-info text-white',
    accent: 'bg-brand text-white',
};

const OUTLINE: Record<Tone, string> = {
    neutral: 'text-shell-muted border border-shell-border',
    success: 'text-[var(--color-success-fg)] border border-[var(--color-success-border)]',
    warning: 'text-[var(--color-warning-fg)] border border-[var(--color-warning-border)]',
    danger: 'text-[var(--color-danger-fg)] border border-[var(--color-danger-border)]',
    info: 'text-[var(--color-info-fg)] border border-[var(--color-info-border)]',
    accent: 'text-brand border border-[color-mix(in_oklab,var(--color-brand)_40%,transparent)]',
};

const SIZE: Record<Size, string> = {
    sm: 'h-5 px-2 text-[10px] gap-1 tracking-eyebrow uppercase font-semibold',
    md: 'h-6 px-2.5 text-meta gap-1.5 font-medium',
};

export default function Badge({
    tone = 'neutral',
    variant = 'soft',
    size = 'sm',
    leadingIcon,
    className,
    children,
    ...rest
}: BadgeProps) {
    const variantClass =
        variant === 'solid' ? SOLID[tone] : variant === 'outline' ? OUTLINE[tone] : SOFT[tone];

    return (
        <span
            className={cn(
                'inline-flex items-center justify-center rounded-full whitespace-nowrap',
                SIZE[size],
                variantClass,
                className
            )}
            {...rest}
        >
            {leadingIcon ? <span className="inline-flex items-center">{leadingIcon}</span> : null}
            {children}
        </span>
    );
}

/* Status dot — quiet alternative to badges, for inline status indication */
interface StatusDotProps {
    tone: Tone;
    pulse?: boolean;
    className?: string;
}

const DOT: Record<Tone, string> = {
    neutral: 'bg-shell-muted-dim',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
    accent: 'bg-brand',
};

export function StatusDot({ tone, pulse, className }: StatusDotProps) {
    return (
        <span className={cn('relative inline-flex w-2 h-2', className)}>
            {pulse && (
                <span
                    aria-hidden
                    className={cn('absolute inset-0 rounded-full opacity-60 animate-ping', DOT[tone])}
                />
            )}
            <span className={cn('relative inline-block w-2 h-2 rounded-full', DOT[tone])} />
        </span>
    );
}

'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from './cn';

interface InfoTooltipProps {
    children: ReactNode;
    label?: string;
    className?: string;
    align?: 'left' | 'right';
}

export default function InfoTooltip({
    children,
    label = 'More info',
    className,
    align = 'left',
}: InfoTooltipProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <span ref={ref} className={cn('relative inline-flex', className)}>
            <button
                type="button"
                aria-label={label}
                aria-expanded={open}
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((v) => !v);
                }}
                className={cn(
                    'inline-flex items-center justify-center w-4 h-4 rounded-full',
                    'border border-shell-border bg-shell-input text-shell-muted-dim',
                    'text-[10px] font-bold leading-none',
                    'hover:text-foreground hover:border-shell-border-deep',
                    'focus:outline-none focus:ring-2 focus:ring-brand/40 focus:ring-offset-0',
                    'transition-colors'
                )}
            >
                i
            </button>
            {open && (
                <span
                    role="tooltip"
                    className={cn(
                        'absolute z-50 top-full mt-2 w-72',
                        align === 'right' ? 'right-0' : 'left-0',
                        'rounded-lg border border-shell-border bg-shell-surface shadow-elevated',
                        'px-3 py-2.5 text-meta text-foreground leading-relaxed',
                        'normal-case tracking-normal font-normal'
                    )}
                >
                    {children}
                </span>
            )}
        </span>
    );
}

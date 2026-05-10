'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
    const [mounted, setMounted] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLButtonElement>(null);
    const containerRef = useRef<HTMLSpanElement>(null);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
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

    function openTooltip() {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const left = align === 'right'
            ? rect.right + window.scrollX - 288  // 288 = w-72
            : rect.left + window.scrollX;
        setCoords({
            top: rect.bottom + window.scrollY + 8,
            left: Math.max(8, left),
        });
        setOpen(true);
    }

    const tooltip = open && mounted ? createPortal(
        <span
            role="tooltip"
            style={{ position: 'absolute', top: coords.top, left: coords.left, zIndex: 9999 }}
            className="w-72 rounded-lg border border-shell-border bg-shell-surface shadow-elevated px-3 py-2.5 text-meta text-foreground leading-relaxed normal-case tracking-normal font-normal pointer-events-auto"
        >
            {children}
        </span>,
        document.body
    ) : null;

    return (
        <span ref={containerRef} className={cn('relative inline-flex', className)}>
            <button
                ref={triggerRef}
                type="button"
                aria-label={label}
                aria-expanded={open}
                onClick={(e) => {
                    e.stopPropagation();
                    if (open) setOpen(false);
                    else openTooltip();
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
            {tooltip}
        </span>
    );
}

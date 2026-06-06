'use client';

import { ReactNode, useEffect, useRef } from 'react';

import { cn } from './cn';

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title?: ReactNode;
    side?: 'left' | 'right';
    children: ReactNode;
    footer?: ReactNode;
    /** Width class for the panel (default w-96). */
    widthClassName?: string;
}

/**
 * Canonical side-drawer shell (CLAUDE.md §7.4.1, layer z-40).
 * Slides in from the chosen edge; outside-click and Esc close it.
 */
export default function Drawer({
    isOpen,
    onClose,
    title,
    side = 'right',
    children,
    footer,
    widthClassName = 'w-96 max-w-[100vw]',
}: DrawerProps) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const previousFocus = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        previousFocus.current = document.activeElement as HTMLElement | null;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        const t = window.setTimeout(() => panelRef.current?.focus(), 0);
        return () => {
            document.body.style.overflow = '';
            document.removeEventListener('keydown', onKey);
            window.clearTimeout(t);
            previousFocus.current?.focus?.();
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-40 bg-[var(--color-overlay)] backdrop-blur-sm"
            onClick={onClose}
            role="presentation"
        >
            <div
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={typeof title === 'string' ? title : undefined}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                    'absolute top-0 bottom-0 flex flex-col bg-shell-surface border-shell-border shadow-elevated',
                    side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
                    widthClassName,
                )}
            >
                {title && (
                    <div className="flex items-center justify-between gap-3 border-b border-shell-border px-5 py-4">
                        <h2 className="text-h3 font-semibold text-foreground">{title}</h2>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-shell-border text-shell-muted hover:bg-shell-input hover:text-foreground transition-colors focus-ring"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}
                <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
                {footer && (
                    <div className="flex items-center justify-end gap-2 border-t border-shell-border bg-shell-surface/60 px-5 py-4">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

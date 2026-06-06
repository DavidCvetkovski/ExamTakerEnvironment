'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { cn } from './cn';

type Size = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: ReactNode;
    size?: Size;
    children: ReactNode;
    footer?: ReactNode;
    /** When true, suppress backdrop-click close (e.g. confirm dialogs). */
    blockBackdropClose?: boolean;
    /** Optional extra classes on the inner panel. */
    panelClassName?: string;
    /** Aria label when no visible title is rendered. */
    ariaLabel?: string;
}

const SIZE: Record<Size, string> = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
};

/**
 * Canonical centered modal shell (CLAUDE.md §7.3 / §7.4.1).
 * Handles backdrop, blur, body-scroll lock, Esc-to-close, focus trap-lite.
 */
export default function Modal({
    isOpen,
    onClose,
    title,
    size = 'md',
    children,
    footer,
    blockBackdropClose,
    panelClassName,
    ariaLabel,
}: ModalProps) {
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
        // Focus the panel so Esc / tab cycle starts inside.
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] backdrop-blur-sm p-4"
            onClick={blockBackdropClose ? undefined : onClose}
            role="presentation"
        >
            <div
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={typeof title === 'string' ? title : ariaLabel}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                    'w-full rounded-2xl border border-shell-border bg-shell-surface shadow-elevated outline-none',
                    'flex flex-col max-h-[90vh] overflow-hidden',
                    SIZE[size],
                    panelClassName,
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

'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from './cn';

export type RowAction = {
    label: string;
    onClick: () => void;
    tone?: 'default' | 'danger';
    disabled?: boolean;
    disabledReason?: string;
};

interface RowActionMenuProps {
    items: RowAction[];
    ariaLabel?: string;
}

export default function RowActionMenu({ items, ariaLabel = 'Row actions' }: RowActionMenuProps) {
    const [open, setOpen] = useState(false);
    const [openUp, setOpenUp] = useState(false);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (
                menuRef.current?.contains(e.target as Node) ||
                triggerRef.current?.contains(e.target as Node)
            ) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const handleToggle = () => {
        if (!open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            // Heuristic: if there's < 200px below the trigger, open upward.
            setOpenUp(window.innerHeight - rect.bottom < 200);
        }
        setOpen((v) => !v);
    };

    return (
        <div className="relative inline-block">
            <button
                ref={triggerRef}
                type="button"
                onClick={handleToggle}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={ariaLabel}
                className={cn(
                    'inline-flex items-center justify-center w-8 h-8 rounded-md',
                    'text-shell-muted hover:text-foreground hover:bg-shell-input-alt',
                    'focus-ring transition-colors',
                )}
            >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <circle cx="3" cy="8" r="1.5" />
                    <circle cx="8" cy="8" r="1.5" />
                    <circle cx="13" cy="8" r="1.5" />
                </svg>
            </button>
            {open && (
                <div
                    ref={menuRef}
                    role="menu"
                    className={cn(
                        'absolute right-0 z-50 min-w-[180px] py-1',
                        'rounded-xl border border-shell-border bg-shell-surface shadow-elevated',
                        openUp ? 'bottom-full mb-1' : 'top-full mt-1',
                    )}
                >
                    {items.map((item, idx) => (
                        <button
                            key={idx}
                            type="button"
                            role="menuitem"
                            disabled={item.disabled}
                            title={item.disabled ? item.disabledReason : undefined}
                            onClick={() => {
                                if (item.disabled) return;
                                item.onClick();
                                setOpen(false);
                            }}
                            className={cn(
                                'w-full text-left px-3 py-2 text-meta transition-colors',
                                'focus-ring',
                                item.disabled
                                    ? 'text-shell-muted-dim opacity-60 cursor-not-allowed'
                                    : item.tone === 'danger'
                                        ? 'text-[var(--color-danger-fg)] hover:bg-[var(--color-danger-bg)]'
                                        : 'text-foreground hover:bg-shell-input-alt',
                            )}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

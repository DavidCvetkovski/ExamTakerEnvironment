'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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


    // Close on outside click / Escape
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (triggerRef.current?.contains(target)) return;
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
            // Space below trigger, constrained by nearest scroll container if any
            let spaceBelow = window.innerHeight - rect.bottom;
            const container = triggerRef.current.closest('.overflow-x-auto') || triggerRef.current.closest('table');
            if (container) {
                const containerRect = container.getBoundingClientRect();
                const containerSpaceBelow = containerRect.bottom - rect.bottom;
                spaceBelow = Math.min(spaceBelow, containerSpaceBelow);
            }
            setOpenUp(spaceBelow < 160);
        }
        setOpen(v => !v);
    };

    // Compute inline placement for portal menu
    const computeMenuStyle = (): React.CSSProperties => {
        if (!triggerRef.current) return {};
        const rect = triggerRef.current.getBoundingClientRect();
        const base: React.CSSProperties = {
            position: 'absolute',
            right: `${window.innerWidth - rect.right}px`,
        };
        if (openUp) {
            base.bottom = `${window.innerHeight - rect.top}px`;
        } else {
            base.top = `${rect.bottom}px`;
        }
        return base;
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
            {open && createPortal(
                <div

                    role="menu"
                    style={computeMenuStyle()}
                    className={cn(
                        'min-w-[180px] py-1 z-[9999]',
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
                </div>,
                document.body
            )}
        </div>
    );
}

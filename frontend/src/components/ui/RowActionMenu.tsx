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
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    // Close on outside click / Escape. The menu is portaled to <body>, so it is
    // NOT inside the trigger — we must also ignore clicks landing in the menu,
    // otherwise mousedown on a menu item closes it before the click fires.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
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
            const up = spaceBelow < 160;
            // Compute placement here (event handler, not render) so the portal
            // menu is positioned without reading refs during render. Fixed
            // positioning matches viewport-relative getBoundingClientRect.
            setMenuStyle({
                position: 'fixed',
                right: `${window.innerWidth - rect.right}px`,
                ...(up ? { bottom: `${window.innerHeight - rect.top}px` } : { top: `${rect.bottom}px` }),
            });
        }
        setOpen(v => !v);
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
                    ref={menuRef}
                    role="menu"
                    style={menuStyle}
                    className={cn(
                        'min-w-[180px] py-1 z-50',
                        'rounded-xl border border-shell-border bg-shell-surface shadow-elevated',
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

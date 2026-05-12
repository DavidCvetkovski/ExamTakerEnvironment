'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import { ThemePreference, useAuthStore, UserPublic } from '@/stores/useAuthStore';
import { useClickOutside } from '@/hooks/useClickOutside';
import Button from '@/components/ui/Button';

const THEMES: Array<{ label: string; value: ThemePreference; hint?: string }> = [
    { label: 'Auto', value: 'auto', hint: 'Follows time of day' },
    { label: 'Dark', value: 'dark' },
    { label: 'Warm', value: 'warm' },
    { label: 'Light blue', value: 'light-blue' },
];

function getRoleDefaultTheme(role: UserPublic['role'] | undefined): ThemePreference {
    return role === 'STUDENT' ? 'warm' : 'dark';
}

export default function ThemeToggle() {
    const { user, themePreference, setThemePreference } = useAuthStore();
    const [isOpen, setIsOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();

    const activeTheme = useMemo(
        () => themePreference ?? getRoleDefaultTheme(user?.role),
        [themePreference, user?.role],
    );

    // Close popover on outside click
    useClickOutside(popoverRef, () => setIsOpen(false));

    // Close popover on Escape key
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Close popover on route change
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    return (
        <div ref={popoverRef} className="relative">
            <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsOpen((open) => !open)}
                aria-label="Switch theme"
                aria-haspopup="menu"
                aria-expanded={isOpen}
            >
                Theme
            </Button>

            {isOpen ? (
                <div className="absolute right-0 top-12 z-20 min-w-44 rounded-xl border border-shell-border bg-shell-surface shadow-elevated backdrop-blur" role="menu">
                    {THEMES.map((theme) => {
                        const isActive = activeTheme === theme.value;
                        return (
                            <button
                                key={theme.value}
                                type="button"
                                role="menuitem"
                                disabled={isSaving}
                                onClick={async () => {
                                    setIsSaving(true);
                                    try {
                                        await setThemePreference(theme.value);
                                        setIsOpen(false);
                                    } finally {
                                        setIsSaving(false);
                                    }
                                }}
                                className={`flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                    isActive
                                        ? 'bg-shell-border-deep text-foreground'
                                        : 'text-foreground hover:bg-shell-border/20'
                                }`}
                            >
                                <span className="flex flex-col">
                                    <span>{theme.label}</span>
                                    {theme.hint && (
                                        <span className="text-eyebrow text-shell-muted-dim">{theme.hint}</span>
                                    )}
                                </span>
                                <span aria-hidden="true">{isActive ? '•' : ''}</span>
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

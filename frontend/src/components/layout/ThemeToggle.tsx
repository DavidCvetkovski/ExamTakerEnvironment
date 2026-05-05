'use client';

import { useEffect, useMemo, useState } from 'react';

import { ThemePreference, useAuthStore, UserPublic } from '@/stores/useAuthStore';

const THEMES: Array<{ label: string; value: ThemePreference }> = [
    { label: 'Dark', value: 'dark' },
    { label: 'Warm', value: 'warm' },
    { label: 'Light Blue', value: 'light-blue' },
];

function getRoleDefaultTheme(role: UserPublic['role'] | undefined): ThemePreference {
    return role === 'STUDENT' ? 'warm' : 'dark';
}

export default function ThemeToggle() {
    const { user, themePreference, themeNotice, setThemePreference, clearThemeNotice } = useAuthStore();
    const [isOpen, setIsOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const activeTheme = useMemo(
        () => themePreference ?? getRoleDefaultTheme(user?.role),
        [themePreference, user?.role],
    );

    useEffect(() => {
        if (!themeNotice) {
            return undefined;
        }

        const timer = window.setTimeout(() => clearThemeNotice(), 2500);
        return () => window.clearTimeout(timer);
    }, [clearThemeNotice, themeNotice]);

    return (
        <div className="relative">
            <button
                type="button"
                aria-label="Switch theme"
                onClick={() => setIsOpen((open) => !open)}
                className="rounded-md border border-white/10 px-3 py-2 text-sm font-medium transition-colors hover:bg-white/5"
            >
                Theme
            </button>

            {isOpen ? (
                <div className="absolute right-0 top-12 z-20 min-w-44 rounded-xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur">
                    {THEMES.map((theme) => {
                        const isActive = activeTheme === theme.value;
                        return (
                            <button
                                key={theme.value}
                                type="button"
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
                                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                    isActive
                                        ? 'bg-blue-600 text-white'
                                        : 'text-gray-200 hover:bg-white/5'
                                }`}
                            >
                                <span>{theme.label}</span>
                                <span aria-hidden="true">{isActive ? '•' : ''}</span>
                            </button>
                        );
                    })}
                </div>
            ) : null}

            <div className="sr-only" aria-live="polite">
                {themeNotice ?? ''}
            </div>
            {themeNotice ? (
                <p className="absolute right-0 top-24 whitespace-nowrap text-xs text-gray-300">
                    {themeNotice}
                </p>
            ) : null}
        </div>
    );
}

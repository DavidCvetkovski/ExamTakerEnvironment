'use client';

import { useEffect, useState } from 'react';

import { EffectiveTheme, ThemePreference, useAuthStore, UserPublic } from '@/stores/useAuthStore';
import { resolveAutoTheme } from '@/lib/themeAuto';

const THEME_STORAGE_KEY = 'theme';

function getRoleDefaultTheme(role: UserPublic['role'] | undefined): ThemePreference | null {
    if (role === 'STUDENT') {
        return 'warm';
    }

    if (role) {
        return 'dark';
    }

    return null;
}

function resolvePreference(
    role: UserPublic['role'] | undefined,
    isAuthenticated: boolean,
    isLoading: boolean,
    themePreference: ThemePreference | null,
): ThemePreference | null {
    if (themePreference) {
        return themePreference;
    }

    if (!isAuthenticated) {
        if (isLoading && typeof window !== 'undefined') {
            return window.localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null;
        }
        return null;
    }

    return getRoleDefaultTheme(role);
}

/** Apply the user's theme preference to <html>, polling every 5min when in auto mode. */
export default function ThemeProvider() {
    const { isAuthenticated, isLoading, themePreference, user } = useAuthStore();
    const [autoTick, setAutoTick] = useState(0);

    const preference = resolvePreference(user?.role, isAuthenticated, isLoading, themePreference);

    // Re-evaluate the auto theme every 5 minutes (CLAUDE.md §7.12).
    useEffect(() => {
        if (preference !== 'auto') return;
        const interval = window.setInterval(() => setAutoTick((n) => n + 1), 5 * 60 * 1000);
        return () => window.clearInterval(interval);
    }, [preference]);

    useEffect(() => {
        const effective: EffectiveTheme | null =
            preference === 'auto' ? resolveAutoTheme() :
            preference === 'dark' || preference === 'warm' || preference === 'light-blue' ? preference :
            null;

        if (effective) {
            document.documentElement.dataset.theme = effective;
            return;
        }

        delete document.documentElement.dataset.theme;
    }, [preference, autoTick]);

    return null;
}

'use client';

import { useEffect } from 'react';

import { ThemePreference, useAuthStore, UserPublic } from '@/stores/useAuthStore';

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

function resolveTheme(
    role: UserPublic['role'] | undefined,
    isAuthenticated: boolean,
    isLoading: boolean,
    themePreference: ThemePreference | null,
): string | null {
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

export default function ThemeProvider() {
    const { isAuthenticated, isLoading, themePreference, user } = useAuthStore();

    useEffect(() => {
        const theme = resolveTheme(user?.role, isAuthenticated, isLoading, themePreference);

        if (theme) {
            document.documentElement.dataset.theme = theme;
            return;
        }

        delete document.documentElement.dataset.theme;
    }, [isAuthenticated, isLoading, themePreference, user?.role]);

    return null;
}

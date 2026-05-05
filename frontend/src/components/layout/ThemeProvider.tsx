'use client';

import { useEffect } from 'react';

import { useAuthStore, UserPublic } from '@/stores/useAuthStore';

function resolveTheme(role: UserPublic['role'] | undefined, isAuthenticated: boolean): string | null {
    if (!isAuthenticated) {
        return null;
    }

    return role === 'STUDENT' ? 'warm' : null;
}

export default function ThemeProvider() {
    const { isAuthenticated, user } = useAuthStore();

    useEffect(() => {
        const theme = resolveTheme(user?.role, isAuthenticated);

        if (theme) {
            document.documentElement.dataset.theme = theme;
            return;
        }

        delete document.documentElement.dataset.theme;
    }, [isAuthenticated, user?.role]);

    return null;
}

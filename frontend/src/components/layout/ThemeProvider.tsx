'use client';

import { useEffect, useState } from 'react';

import {
    AccessibilityPreferences,
    DEFAULT_ACCESSIBILITY,
    EffectiveTheme,
    ThemePreference,
    useAuthStore,
    UserPublic,
} from '@/stores/useAuthStore';
import { resolveAutoTheme } from '@/lib/themeAuto';

const THEME_STORAGE_KEY = 'theme';
const A11Y_STORAGE_KEY = 'a11y';

/** Resolve the a11y profile to apply: the in-memory store once authenticated,
 *  otherwise the persisted copy (so the profile survives reload without a flash
 *  of the default before /me resolves). */
function resolveAccessibility(
    isAuthenticated: boolean,
    storeProfile: AccessibilityPreferences,
): AccessibilityPreferences {
    if (isAuthenticated) {
        return storeProfile;
    }
    if (typeof window === 'undefined') {
        return DEFAULT_ACCESSIBILITY;
    }
    const raw = window.localStorage.getItem(A11Y_STORAGE_KEY);
    if (!raw) {
        return DEFAULT_ACCESSIBILITY;
    }
    try {
        return { ...DEFAULT_ACCESSIBILITY, ...(JSON.parse(raw) as Partial<AccessibilityPreferences>) };
    } catch {
        return DEFAULT_ACCESSIBILITY;
    }
}

/** Apply the accessibility profile to <html> as orthogonal data-a11y-* attributes.
 *  globals.css carries the token-override blocks; this just toggles the flags. */
function applyAccessibility(prefs: AccessibilityPreferences): void {
    const root = document.documentElement;

    if (prefs.high_contrast) {
        root.dataset.a11yContrast = 'high';
    } else {
        delete root.dataset.a11yContrast;
    }

    if (prefs.dyslexia_font) {
        root.dataset.a11yFont = 'dyslexic';
    } else {
        delete root.dataset.a11yFont;
    }

    if (prefs.text_scale && prefs.text_scale !== 'md') {
        root.dataset.a11yScale = prefs.text_scale;
    } else {
        delete root.dataset.a11yScale;
    }
}

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

/** Apply the user's theme preference + accessibility profile to <html>, polling
 *  every 5min when the theme is in auto mode. */
export default function ThemeProvider() {
    const { isAuthenticated, isLoading, themePreference, user, accessibility } = useAuthStore();
    const [autoTick, setAutoTick] = useState(0);

    const preference = resolvePreference(user?.role, isAuthenticated, isLoading, themePreference);

    // Apply the orthogonal accessibility axis whenever the resolved profile changes.
    useEffect(() => {
        applyAccessibility(resolveAccessibility(isAuthenticated, accessibility));
    }, [isAuthenticated, accessibility]);

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

import { create } from 'zustand';
import { api } from '../lib/api';

export type ThemePreference = 'dark' | 'warm' | 'light-blue' | 'auto';
/** A concrete theme the page actually renders under (no `auto`). */
export type EffectiveTheme = 'dark' | 'warm' | 'light-blue';
const THEME_STORAGE_KEY = 'theme';
const A11Y_STORAGE_KEY = 'a11y';

export type TextScale = 'md' | 'lg' | 'xl';

/** Visual accessibility profile — orthogonal to the colour theme. */
export interface AccessibilityPreferences {
    high_contrast: boolean;
    dyslexia_font: boolean;
    text_scale: TextScale | null;
}

/** A partial update; omitted fields are left unchanged. `text_scale: 'default'`
 *  clears the scale override back to the default size. */
export interface AccessibilityPatch {
    high_contrast?: boolean;
    dyslexia_font?: boolean;
    text_scale?: TextScale | 'default';
}

export const DEFAULT_ACCESSIBILITY: AccessibilityPreferences = {
    high_contrast: false,
    dyslexia_font: false,
    text_scale: null,
};

export interface UserPublic {
    id: string;
    email: string;
    role: 'ADMIN' | 'CONSTRUCTOR' | 'REVIEWER' | 'STUDENT';
    vunet_id: string | null;
    is_active: boolean;
    theme_preference?: ThemePreference | null;
    accessibility?: AccessibilityPreferences;
}

interface AuthState {
    user: UserPublic | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    themePreference: ThemePreference | null;
    accessibility: AccessibilityPreferences;

    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, role: string) => Promise<void>;
    logout: () => void;
    refreshToken: () => Promise<void>;
    fetchMe: () => Promise<void>;
    initialize: () => Promise<void>;
    setThemePreference: (theme: ThemePreference | null) => Promise<void>;
    setAccessibilityPreference: (patch: AccessibilityPatch) => Promise<void>;
    changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
    logoutEverywhere: (password: string) => Promise<void>;
    deactivateAccount: (password: string) => Promise<void>;
}

/** The token-bearing payload returned by login, register, refresh, change-password
 *  and logout-all — the single session shape the store hydrates from. */
interface SessionResponse {
    access_token: string;
    user: UserPublic;
}

export function getHomePathForRole(role?: UserPublic['role'] | null): string {
    if (role === 'STUDENT') {
        return '/my-exams';
    }
    return '/sessions';
}

function syncStoredTheme(theme: ThemePreference | null): void {
    if (typeof window === 'undefined') {
        return;
    }

    if (theme === null) {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
        return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

/** Persist the a11y profile so it applies on reload before auth re-hydrates
 *  (prevents a flash of the default profile), mirroring the theme key. */
function syncStoredA11y(prefs: AccessibilityPreferences): void {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
}

/** Hydrate the store from a token-bearing session response. Single source for
 *  the "we now hold a session" transition — shared by login, register, refresh,
 *  change-password and logout-all so the token/user/theme/a11y wiring lives once. */
function hydrateSession(set: (partial: Partial<AuthState>) => void, data: SessionResponse): void {
    const accessibility = data.user.accessibility ?? DEFAULT_ACCESSIBILITY;
    syncStoredTheme(data.user.theme_preference ?? null);
    syncStoredA11y(accessibility);
    set({
        accessToken: data.access_token,
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        themePreference: data.user.theme_preference ?? null,
        accessibility,
    });
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,
    themePreference: null,
    accessibility: DEFAULT_ACCESSIBILITY,

    login: async (email, password) => {
        try {
            set({ isLoading: true });
            const resp = await api.post('auth/login', { email, password });
            hydrateSession(set, resp.data);
        } catch (error) {
            set({ isLoading: false });
            throw error;
        }
    },

    register: async (email, password, role) => {
        try {
            set({ isLoading: true });
            const resp = await api.post('auth/register', { email, password, role });
            hydrateSession(set, resp.data);
        } catch (error) {
            set({ isLoading: false });
            throw error;
        }
    },

    logout: () => {
        // Clear local state immediately — no waiting on network
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(A11Y_STORAGE_KEY);
        }
        set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            isLoading: false,
            themePreference: null,
            accessibility: DEFAULT_ACCESSIBILITY,
        });
        // Fire-and-forget: tell the backend to invalidate the refresh token cookie
        api.post('auth/logout').catch(() => { /* already cleared locally */ });
    },

    refreshToken: async () => {
        const resp = await api.post('auth/refresh');
        hydrateSession(set, resp.data);
    },

    fetchMe: async () => {
        try {
            const resp = await api.get('auth/me');
            const accessibility = resp.data.accessibility ?? DEFAULT_ACCESSIBILITY;
            syncStoredTheme(resp.data.theme_preference ?? null);
            syncStoredA11y(accessibility);
            set({
                user: resp.data,
                isAuthenticated: true,
                themePreference: resp.data.theme_preference ?? null,
                accessibility,
            });
        } catch {
            // If /me fails, let the interceptor handle it or log out
            set({ user: null, isAuthenticated: false, accessToken: null, themePreference: null });
        }
    },

    initialize: async () => {
        // If we already have a session in memory, don't re-initialize
        if (get().isAuthenticated && get().user) {
            set({ isLoading: false });
            return;
        }

        set({ isLoading: true });
        try {
            await get().refreshToken();
        } catch {
            set({ isAuthenticated: false, user: null, themePreference: null });
        } finally {
            set({ isLoading: false });
        }
    },

    setThemePreference: async (theme) => {
        const previousTheme = get().themePreference;
        const previousUser = get().user;

        syncStoredTheme(theme);
        set({
            themePreference: theme,
            user: previousUser ? { ...previousUser, theme_preference: theme } : previousUser,
        });

        try {
            await api.patch('users/me/preferences/theme', { theme });
        } catch (error) {
            syncStoredTheme(previousTheme);
            set({
                themePreference: previousTheme,
                user: previousUser,
            });
            throw error;
        }
    },

    setAccessibilityPreference: async (patch) => {
        const previous = get().accessibility;

        // Optimistic: fold the patch into local state immediately.
        const next: AccessibilityPreferences = {
            high_contrast: patch.high_contrast ?? previous.high_contrast,
            dyslexia_font: patch.dyslexia_font ?? previous.dyslexia_font,
            text_scale:
                patch.text_scale === undefined
                    ? previous.text_scale
                    : patch.text_scale === 'default'
                      ? null
                      : patch.text_scale,
        };
        syncStoredA11y(next);
        set({ accessibility: next });

        try {
            const resp = await api.patch('users/me/preferences/accessibility', patch);
            // Trust the server's resolved profile.
            syncStoredA11y(resp.data);
            set({ accessibility: resp.data });
        } catch (error) {
            syncStoredA11y(previous);
            set({ accessibility: previous });
            throw error;
        }
    },

    changePassword: async (currentPassword, newPassword) => {
        // Server invalidates every other session and returns a fresh token pair
        // for this tab — hydrate from it so the current session stays alive.
        const resp = await api.post('auth/change-password', {
            current_password: currentPassword,
            new_password: newPassword,
        });
        hydrateSession(set, resp.data);
    },

    logoutEverywhere: async (password) => {
        const resp = await api.post('auth/logout-all', { password });
        hydrateSession(set, resp.data);
    },

    deactivateAccount: async (password) => {
        await api.post('users/me/deactivate', { password });
        // Account is gone for this session — drop local state and let the UI
        // route to /login.
        get().logout();
    },
}));

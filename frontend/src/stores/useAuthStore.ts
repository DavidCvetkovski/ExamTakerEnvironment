import { create } from 'zustand';
import { api } from '../lib/api';

export type ThemePreference = 'dark' | 'warm' | 'light-blue' | 'auto';
/** A concrete theme the page actually renders under (no `auto`). */
export type EffectiveTheme = 'dark' | 'warm' | 'light-blue';
const THEME_STORAGE_KEY = 'theme';

export interface UserPublic {
    id: string;
    email: string;
    role: 'ADMIN' | 'CONSTRUCTOR' | 'REVIEWER' | 'STUDENT';
    vunet_id: string | null;
    is_active: boolean;
    theme_preference?: ThemePreference | null;
}

interface AuthState {
    user: UserPublic | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    themePreference: ThemePreference | null;

    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, role: string) => Promise<void>;
    logout: () => void;
    refreshToken: () => Promise<void>;
    fetchMe: () => Promise<void>;
    initialize: () => Promise<void>;
    setThemePreference: (theme: ThemePreference | null) => Promise<void>;
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

/** Hydrate the store from a token-bearing session response. Single source for
 *  the "we now hold a session" transition — shared by login, register, refresh,
 *  change-password and logout-all so the token/user/theme wiring lives once. */
function hydrateSession(set: (partial: Partial<AuthState>) => void, data: SessionResponse): void {
    syncStoredTheme(data.user.theme_preference ?? null);
    set({
        accessToken: data.access_token,
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        themePreference: data.user.theme_preference ?? null,
    });
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,
    themePreference: null,

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
        set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            isLoading: false,
            themePreference: null,
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
            syncStoredTheme(resp.data.theme_preference ?? null);
            set({
                user: resp.data,
                isAuthenticated: true,
                themePreference: resp.data.theme_preference ?? null,
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

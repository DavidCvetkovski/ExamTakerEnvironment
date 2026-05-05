import { create } from 'zustand';
import { api } from '../lib/api';

export type ThemePreference = 'dark' | 'warm' | 'light-blue';
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
    themeNotice: string | null;

    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, role: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshToken: () => Promise<void>;
    fetchMe: () => Promise<void>;
    initialize: () => Promise<void>;
    setThemePreference: (theme: ThemePreference | null) => Promise<void>;
    clearThemeNotice: () => void;
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

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,
    themePreference: null,
    themeNotice: null,

    login: async (email, password) => {
        try {
            set({ isLoading: true });
            const resp = await api.post('auth/login', { email, password });
            const { access_token, user } = resp.data;
            syncStoredTheme(user.theme_preference ?? null);
            set({
                accessToken: access_token,
                user,
                isAuthenticated: true,
                isLoading: false,
                themePreference: user.theme_preference ?? null,
            });
        } catch (error) {
            set({ isLoading: false });
            throw error;
        }
    },

    register: async (email, password, role) => {
        try {
            set({ isLoading: true });
            const resp = await api.post('auth/register', { email, password, role });
            const { access_token, user } = resp.data;
            syncStoredTheme(user.theme_preference ?? null);
            set({
                accessToken: access_token,
                user,
                isAuthenticated: true,
                isLoading: false,
                themePreference: user.theme_preference ?? null,
            });
        } catch (error) {
            set({ isLoading: false });
            throw error;
        }
    },

    logout: async () => {
        try {
            await api.post('auth/logout');
        } catch (e) {
            console.warn("Logout request failed, clearing local state anyway.", e);
        } finally {
            set({
                user: null,
                accessToken: null,
                isAuthenticated: false,
                isLoading: false,
                themePreference: null,
            });
        }
    },

    refreshToken: async () => {
        const resp = await api.post('auth/refresh');
        const { access_token, user } = resp.data;
        syncStoredTheme(user.theme_preference ?? null);
        set({
            accessToken: access_token,
            user,
            isAuthenticated: true,
            themePreference: user.theme_preference ?? null,
        });
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
            themeNotice: theme ? `Theme set to ${theme}.` : 'Theme reset to automatic.',
            user: previousUser ? { ...previousUser, theme_preference: theme } : previousUser,
        });

        try {
            await api.patch('users/me/preferences/theme', { theme });
        } catch (error) {
            syncStoredTheme(previousTheme);
            set({
                themePreference: previousTheme,
                themeNotice: 'Could not save theme preference.',
                user: previousUser,
            });
            throw error;
        }
    },

    clearThemeNotice: () => set({ themeNotice: null }),
}));

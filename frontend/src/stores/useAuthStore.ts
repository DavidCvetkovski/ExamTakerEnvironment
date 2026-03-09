import { create } from 'zustand';
import { api } from '../lib/api';

export interface UserPublic {
    id: string;
    email: string;
    role: 'ADMIN' | 'CONSTRUCTOR' | 'REVIEWER' | 'STUDENT';
    vunet_id: string | null;
    is_active: boolean;
}

interface AuthState {
    user: UserPublic | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;

    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, role: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshToken: () => Promise<void>;
    fetchMe: () => Promise<void>;
    initialize: () => Promise<void>;
}

export function getHomePathForRole(role?: UserPublic['role'] | null): string {
    if (role === 'STUDENT') {
        return '/my-exams';
    }
    return '/sessions';
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: true,

    login: async (email, password) => {
        try {
            set({ isLoading: true });
            const resp = await api.post('auth/login', { email, password });
            const { access_token, user } = resp.data;
            set({
                accessToken: access_token,
                user,
                isAuthenticated: true,
                isLoading: false,
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
            set({
                accessToken: access_token,
                user,
                isAuthenticated: true,
                isLoading: false,
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
            });
        }
    },

    refreshToken: async () => {
        const resp = await api.post('auth/refresh');
        const { access_token, user } = resp.data;
        set({
            accessToken: access_token,
            user,
            isAuthenticated: true,
        });
    },

    fetchMe: async () => {
        try {
            const resp = await api.get('auth/me');
            set({ user: resp.data, isAuthenticated: true });
        } catch {
            // If /me fails, let the interceptor handle it or log out
            set({ user: null, isAuthenticated: false, accessToken: null });
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
            set({ isAuthenticated: false, user: null });
        } finally {
            set({ isLoading: false });
        }
    },
}));

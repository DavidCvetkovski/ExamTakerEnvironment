import axios from 'axios';
import { useAuthStore } from '../stores/useAuthStore';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000/api/';

// Base API instance
export const api = axios.create({
    baseURL: apiBaseUrl,
    withCredentials: true,
});

// Request Interceptor: Attach access token if available
api.interceptors.request.use(
    (config) => {
        const token = useAuthStore.getState().accessToken;
        if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401s by attempting a token refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Avoid infinite loops if the refresh endpoint itself 401s
        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.url?.includes('auth/refresh') &&
            !originalRequest.url?.includes('auth/login')
        ) {
            originalRequest._retry = true;
            try {
                // Attempt to refresh the token
                await useAuthStore.getState().refreshToken();

                // Retry the original request with the new token
                const newToken = useAuthStore.getState().accessToken;
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return api(originalRequest);
            } catch (refreshError) {
                // Refresh failed (e.g., refresh token expired or missing)
                useAuthStore.getState().logout();
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);

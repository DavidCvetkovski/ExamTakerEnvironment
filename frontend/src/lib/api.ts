import axios from 'axios';
import { useAuthStore } from '../stores/useAuthStore';

const getApiBaseUrl = (): string => {
    if (process.env.NEXT_PUBLIC_API_BASE_URL) {
        return process.env.NEXT_PUBLIC_API_BASE_URL;
    }
    if (typeof window !== 'undefined') {
        return `http://${window.location.hostname}:8000/api/`;
    }
    return 'http://127.0.0.1:8000/api/';
};

const apiBaseUrl = getApiBaseUrl();

// Base API instance
export const api = axios.create({
    baseURL: apiBaseUrl,
    withCredentials: true,
});

/** LTI-style pagination envelope returned by list endpoints (backend §4, #25). */
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    skip: number;
    limit: number;
}

/**
 * Fetch every page of a paginated `{ items, total, skip, limit }` endpoint and
 * return the flattened list. Lets callers that need the whole collection keep
 * their list semantics while each request stays bounded (Epoch 15, #25). The
 * backend caps `limit` at 200, so that is the page size here.
 */
export async function fetchAllPaginated<T>(
    url: string,
    params: Record<string, unknown> = {},
    pageSize = 200,
): Promise<T[]> {
    const all: T[] = [];
    let skip = 0;
    for (;;) {
        const { data } = await api.get<PaginatedResponse<T>>(url, {
            params: { ...params, skip, limit: pageSize },
        });
        all.push(...data.items);
        skip += data.items.length;
        // Stop on the final (short) page or once we've reached the reported
        // total. The empty-page check guards against an infinite loop if the
        // server ever misreports `total`.
        if (data.items.length < pageSize || skip >= data.total || data.items.length === 0) {
            break;
        }
    }
    return all;
}

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

        // Avoid infinite loops on auth endpoints — never retry logout/refresh/login
        const isAuthEndpoint =
            originalRequest.url?.includes('auth/refresh') ||
            originalRequest.url?.includes('auth/login') ||
            originalRequest.url?.includes('auth/logout');

        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !isAuthEndpoint
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

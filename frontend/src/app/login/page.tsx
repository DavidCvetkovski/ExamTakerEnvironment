'use client';

import type { AxiosError } from 'axios';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getHomePathForRole, useAuthStore } from '../../stores/useAuthStore';

function getSafeRedirectPath(redirect: string | null): string | null {
    if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) {
        return null;
    }
    return redirect;
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-shell-bg" />}>
            <LoginPageInner />
        </Suspense>
    );
}

function LoginPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { login, isAuthenticated, isLoading, initialize, user } = useAuthStore();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Initialize session check on mount
    useEffect(() => {
        initialize();
    }, [initialize]);

    useEffect(() => {
        if (isAuthenticated) {
            const redirect = getSafeRedirectPath(searchParams.get('redirect'));
            router.push(redirect || getHomePathForRole(user?.role));
        }
    }, [isAuthenticated, router, searchParams, user?.role]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        try {
            await login(email, password);
            // Let the useEffect handle the redirect
        } catch (err: unknown) {
            const axiosError = err as AxiosError<{ detail?: string }>;
            if (!axiosError.response) {
                setError('Cannot connect to the backend server. Please verify that the database and API are running.');
            } else if (axiosError.response.status === 500) {
                setError('Internal server error. The database might be offline or misconfigured.');
            } else {
                setError(axiosError.response.data?.detail || 'Login failed. Please check your credentials and try again.');
            }
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-shell-bg flex items-center justify-center text-foreground">
                Loading...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-shell-bg flex items-center justify-center font-sans text-foreground">
            <div className="w-full max-w-md bg-shell-surface p-8 space-y-6">
                <h1 className="text-2xl font-bold text-center">OpenVision SSO</h1>
                <div className="bg-shell-bg border border-shell-border p-4 text-xs space-y-2">
                    <p className="text-eyebrow-sm font-bold uppercase tracking-wider text-blue-400">Test Credentials</p>
                    <div className="grid grid-cols-1 gap-1 text-shell-muted">
                        <p><span className="w-24 inline-block">Admin:</span> <code className="text-foreground">admin_e2e@vu.nl / adminpass123</code></p>
                        <p><span className="w-24 inline-block">Constructor:</span> <code className="text-foreground">constructor_e2e@vu.nl / conpass123</code></p>
                        <p><span className="w-24 inline-block">Student:</span> <code className="text-foreground">student_e2e@vu.nl / studentpass123</code></p>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 text-sm rounded">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex flex-col space-y-2">
                        <label htmlFor="email" className="text-sm font-medium">Email Address</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="bg-shell-bg border border-shell-border p-2 text-foreground focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>

                    <div className="flex flex-col space-y-2">
                        <label htmlFor="password" className="text-sm font-medium">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="bg-shell-bg border border-shell-border p-2 text-foreground focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 p-2 text-white mt-4 transition-colors font-medium border border-transparent disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Authenticating...' : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
}

'use client';

import type { AxiosError } from 'axios';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getHomePathForRole, useAuthStore } from '../../stores/useAuthStore';
import { Input, Field, Button } from '@/components/ui';

function getSafeRedirectPath(redirect: string | null): string | null {
    if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//')) {
        return null;
    }
    return redirect;
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-full bg-shell-bg" />}>
            <LoginPageInner />
        </Suspense>
    );
}

function LoginPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { login, isAuthenticated, isLoading, initialize, user } = useAuthStore();
    const [mounted, setMounted] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        initialize();
        const t = setTimeout(() => setMounted(true), 30);
        return () => clearTimeout(t);
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
        setSubmitting(true);
        try {
            await login(email, password);
        } catch (err: unknown) {
            const axiosError = err as AxiosError<{ detail?: string }>;
            if (!axiosError.response) {
                setError('Cannot connect to the server. Make sure the backend is running.');
            } else if (axiosError.response.status === 500) {
                setError('Internal server error. The database may be offline.');
            } else {
                setError(axiosError.response.data?.detail || 'Invalid credentials. Please try again.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const busy = isLoading || submitting;

    return (
        <div data-theme="warm" className="min-h-full bg-shell-bg flex items-center justify-center px-6 py-12 text-foreground">

            {/* ── Centered sign-in card ── */}
            <div className="flex-1 flex items-center justify-center">
                <div className={`w-full max-w-sm transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>

                    {/* Wordmark */}
                    <div className="flex items-center justify-center gap-2.5 mb-10">
                        <span className="w-2.5 h-2.5 rounded-full bg-brand" />
                        <span className="text-xl font-black tracking-tight text-foreground">OpenVision</span>
                    </div>

                    {error && (
                        <div
                            role="alert"
                            className="mb-6 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] px-4 py-3 text-sm leading-snug"
                        >
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <Field label="Email address" htmlFor="email">
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@university.edu"
                                required
                                autoComplete="email"
                                inputSize="lg"
                            />
                        </Field>

                        <Field label="Password" htmlFor="password">
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                autoComplete="current-password"
                                inputSize="lg"
                            />
                        </Field>

                        <Button
                            type="submit"
                            variant="primary"
                            size="lg"
                            className="w-full mt-2"
                            disabled={busy}
                            loading={busy}
                        >
                            {busy ? 'Signing in…' : 'Sign in'}
                        </Button>
                    </form>

                    <p className="mt-10 text-xs text-shell-muted-dim text-center">
                        OpenVision · Academic Assessment Platform
                    </p>
                </div>
            </div>
        </div>
    );
}

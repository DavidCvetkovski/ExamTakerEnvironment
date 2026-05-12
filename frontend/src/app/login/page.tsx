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
        <div data-theme-scope="login" className="min-h-full bg-shell-bg flex flex-col md:flex-row text-foreground">

            {/* ── Left panel: brand ── */}
            <div className="hidden md:flex md:w-[55%] relative bg-shell-surface overflow-hidden flex-col items-center justify-center px-12 py-16">
                {/* Blobs */}
                <div className="pointer-events-none absolute inset-0" aria-hidden>
                    <div className="absolute top-[-20%] left-[-15%] w-[600px] h-[600px] rounded-full bg-brand/12 blur-[130px] animate-blob" />
                    <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-brand/8 blur-[100px] animate-blob animation-delay-2000" />
                </div>

                <div className={`relative z-10 max-w-md text-center transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                    <div className="flex items-center justify-center gap-2 mb-10">
                        <span className="w-2.5 h-2.5 rounded-full bg-brand animate-pulse" />
                        <span className="text-xs font-bold uppercase tracking-eyebrow text-shell-muted">OpenVision</span>
                    </div>

                    <h1 className="text-4xl font-black tracking-tight text-foreground leading-tight mb-4">
                        Academic Assessment,<br />
                        <span className="text-brand">Reimagined.</span>
                    </h1>

                    <p className="text-shell-muted leading-relaxed mb-12">
                        Psychometrically sound. Beautifully designed.<br />Built for the modern university.
                    </p>

                    <div className="flex flex-wrap justify-center gap-3 text-sm text-shell-muted">
                        {[
                            'Adaptive Blueprints',
                            'Psychometric Analytics',
                            'Secure Exam Delivery',
                        ].map((label) => (
                            <span
                                key={label}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-shell-border bg-shell-bg/60"
                            >
                                {label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Right panel: form ── */}
            <div className="flex-1 flex items-center justify-center px-6 py-12">
                <div className={`w-full max-w-sm transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>

                    {/* Mobile logo */}
                    <div className="flex md:hidden items-center justify-center gap-2 mb-8">
                        <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
                        <span className="text-xs font-bold uppercase tracking-eyebrow text-shell-muted">OpenVision</span>
                    </div>

                    <h2 className="text-2xl font-black text-foreground mb-1">Welcome back</h2>
                    <p className="text-sm text-shell-muted mb-8">Sign in to your account to continue.</p>

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

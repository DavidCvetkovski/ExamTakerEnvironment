'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';

// ─── Unauthenticated landing ─────────────────────────────────────────────────

function MarketingPage({ mounted }: { mounted: boolean }) {
    return (
        <div className="relative min-h-full bg-shell-bg overflow-hidden flex flex-col items-center justify-center px-6 text-center">
            <div className="pointer-events-none absolute inset-0" aria-hidden>
                <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-brand/10 blur-[120px] animate-blob" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-brand/8 blur-[100px] animate-blob animation-delay-2000" />
            </div>

            <div className={`relative z-10 max-w-2xl transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                <div className="flex items-center justify-center gap-3 mb-8">
                    <span className="w-3 h-3 rounded-full bg-brand animate-pulse" />
                    <span className="text-eyebrow tracking-eyebrow text-shell-muted uppercase text-sm font-semibold">OpenVision</span>
                </div>

                <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-foreground mb-4 leading-tight">
                    Academic Assessment,<br />
                    <span className="text-brand">Reimagined.</span>
                </h1>

                <p className="text-lg text-shell-muted mb-10 leading-relaxed">
                    Psychometrically sound. Beautifully designed. Built for the modern university.
                </p>

                <Link
                    href="/login"
                    className="inline-flex items-center gap-2 bg-brand hover:bg-brand/90 text-white font-semibold px-8 py-4 rounded-xl text-base transition-all hover:scale-[1.02] hover:shadow-[0_0_32px_var(--color-brand)] focus-ring"
                >
                    Sign in to OpenVision →
                </Link>

                <div className="mt-12 flex flex-wrap justify-center gap-4 text-sm text-shell-muted">
                    {[
                        'Adaptive Blueprints',
                        'Psychometric Analytics',
                        'Secure Exam Delivery',
                    ].map((label) => (
                        <span
                            key={label}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-shell-border bg-shell-surface/50"
                        >
                            {label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Role-aware quick actions ─────────────────────────────────────────────────

interface QuickAction {
    href: string;
    label: string;
    description: string;
}

const CONSTRUCTOR_ACTIONS: QuickAction[] = [
    { href: '/items', label: 'Item Library', description: 'Browse, author & manage question items' },
    { href: '/blueprint', label: 'Blueprints', description: 'Design exam blueprints and test structures' },
    { href: '/sessions', label: 'Sessions', description: 'Schedule and manage exam sessions' },
    { href: '/analytics', label: 'Analytics', description: 'Review psychometric stats and item performance' },
];

const ADMIN_ACTIONS: QuickAction[] = [
    { href: '/sessions', label: 'Sessions', description: 'Manage and schedule all exam sessions' },
    { href: '/items', label: 'Item Library', description: 'Browse and manage all question items' },
    { href: '/blueprint', label: 'Blueprints', description: 'Create and edit exam blueprints' },
    { href: '/analytics', label: 'Analytics', description: 'Platform-wide psychometric analytics' },
];

const STUDENT_ACTIONS: QuickAction[] = [
    { href: '/my-exams', label: 'My Exams', description: 'View upcoming and active exam sessions' },
    { href: '/my-grades', label: 'My Grades', description: 'See published results and feedback' },
];

function getActions(role: string): QuickAction[] {
    if (role === 'STUDENT') return STUDENT_ACTIONS;
    if (role === 'ADMIN') return ADMIN_ACTIONS;
    return CONSTRUCTOR_ACTIONS; // CONSTRUCTOR | REVIEWER
}

function getRoleLabel(role: string): string {
    switch (role) {
        case 'ADMIN': return 'Administrator';
        case 'CONSTRUCTOR': return 'Constructor';
        case 'REVIEWER': return 'Reviewer';
        case 'STUDENT': return 'Student';
        default: return role;
    }
}

function DashboardPage({ mounted }: { mounted: boolean }) {
    const { user } = useAuthStore();
    const router = useRouter();
    const role = user?.role ?? 'CONSTRUCTOR';
    const actions = getActions(role);
    const firstName = user?.email?.split('@')[0] ?? 'there';

    return (
        <div className="relative min-h-full bg-shell-bg overflow-hidden">
            {/* Background blobs */}
            <div className="pointer-events-none absolute inset-0" aria-hidden>
                <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-brand/8 blur-[140px] animate-blob" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-brand/6 blur-[100px] animate-blob animation-delay-2000" />
            </div>

            <div className={`relative z-10 max-w-4xl mx-auto px-6 py-16 transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                {/* Header */}
                <div className="mb-12">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
                        <span className="text-xs font-bold uppercase tracking-eyebrow text-shell-muted">{getRoleLabel(role)}</span>
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-foreground leading-tight">
                        Welcome back,<br />
                        <span className="text-brand">{firstName}.</span>
                    </h1>
                    <p className="mt-4 text-shell-muted text-lg">
                        What would you like to work on today?
                    </p>
                </div>

                {/* Quick action grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {actions.map((action) => (
                        <button
                            key={action.href}
                            onClick={() => router.push(action.href)}
                            className="group text-left rounded-2xl border border-shell-border bg-shell-surface p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-elevated hover:border-brand/40 focus-ring focus:outline-none"
                        >
                            <div className="flex items-start gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-base font-bold text-foreground">
                                            {action.label}
                                        </span>
                                        <span className="text-shell-muted-dim group-hover:text-brand transition-colors text-sm">→</span>
                                    </div>
                                    <p className="mt-1 text-sm text-shell-muted leading-snug">
                                        {action.description}
                                    </p>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Footer note */}
                <p className="mt-12 text-xs text-shell-muted-dim text-center">
                    OpenVision · Academic Assessment Platform
                </p>
            </div>
        </div>
    );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function Home() {
    const [mounted, setMounted] = useState(false);
    const { isAuthenticated, isLoading, initialize } = useAuthStore();

    useEffect(() => {
        initialize();
        const t = setTimeout(() => setMounted(true), 50);
        return () => clearTimeout(t);
    }, [initialize]);

    if (isLoading || !mounted) {
        return <div className="min-h-full bg-shell-bg" />;
    }

    return isAuthenticated
        ? <DashboardPage mounted={mounted} />
        : <MarketingPage mounted={mounted} />;
}

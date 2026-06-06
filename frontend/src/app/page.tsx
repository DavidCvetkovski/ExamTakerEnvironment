'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import { navLinksForRole } from '@/lib/navigation';

// ─── Unauthenticated landing ─────────────────────────────────────────────────

/**
 * Minimal landing surface (Epoch 14.8). Wordmark, one line, one action —
 * nothing else. Pinned to the warm theme via a scoped `data-theme` so it
 * renders identically regardless of the visitor's stored preference (they may
 * not even be signed in yet). Documented PageShell exception (§7.5).
 */
function MarketingPage({ mounted }: { mounted: boolean }) {
    return (
        <div
            data-theme="warm"
            className="relative min-h-full bg-shell-bg flex flex-col items-center justify-center px-6 text-center text-foreground"
        >
            <div
                className={`relative z-10 flex flex-col items-center gap-8 transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            >
                <div className="flex items-center gap-4">
                    {/* Brand dot with pulse ring */}
                    <span className="relative inline-flex w-4 h-4 shrink-0" aria-hidden>
                        <span className="absolute inset-0 rounded-full bg-brand animate-brand-ping" />
                        <span className="relative rounded-full w-4 h-4 bg-brand" />
                    </span>

                    {/* Wordmark — solid base with a bright stripe that sweeps
                        through the glyphs every 5 s (overlay copy, clipped to text) */}
                    <span className="relative inline-block text-5xl sm:text-6xl font-black tracking-tight text-foreground select-none">
                        OpenVision
                        <span className="wordmark-sheen absolute inset-0" aria-hidden>
                            OpenVision
                        </span>
                    </span>
                </div>

                <Link
                    href="/login"
                    className="inline-flex items-center justify-center bg-brand hover:brightness-110 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-[filter] focus-ring"
                >
                    Sign in
                </Link>
            </div>
        </div>
    );
}

// ─── Role-aware home dashboard ────────────────────────────────────────────────

/**
 * The signed-in home screen. Surfaces *every* destination the role can reach
 * (Epoch 14.5) — sourced from the same `navLinksForRole` the header uses — as
 * single-label tiles with no description or arrow.
 */
function DashboardPage({ mounted }: { mounted: boolean }) {
    const { user } = useAuthStore();
    const router = useRouter();
    // L-3: don't default an unhydrated role to a staff view — pass through null.
    const role = user?.role ?? null;
    const links = navLinksForRole(role);
    const firstName = user?.display_name?.trim() || user?.email?.split('@')[0] || 'there';

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
                    <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-foreground leading-tight">
                        What would you like to work on today,<br />
                        <span className="text-brand">{firstName}?</span>
                    </h1>
                </div>

                {/* Quick action grid — single label, no subtext, no arrow. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {links.map((link) => (
                        <button
                            key={link.href}
                            onClick={() => router.push(link.href)}
                            className="group rounded-2xl border border-shell-border bg-shell-surface px-6 py-7 text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-elevated hover:border-brand/40 focus-ring focus:outline-none"
                        >
                            <span className="text-base font-bold text-foreground group-hover:text-brand transition-colors">
                                {link.name}
                            </span>
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

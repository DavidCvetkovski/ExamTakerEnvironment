'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Home() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setMounted(true), 50);
        return () => clearTimeout(t);
    }, []);

    return (
        <div className="relative min-h-full bg-shell-bg overflow-hidden flex flex-col items-center justify-center px-6 text-center">
            {/* Animated background blobs */}
            <div className="pointer-events-none absolute inset-0" aria-hidden>
                <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-brand/10 blur-[120px] animate-blob" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-brand/8 blur-[100px] animate-blob animation-delay-2000" />
            </div>

            {/* Content */}
            <div
                className={`relative z-10 max-w-2xl transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
            >
                {/* Logo mark */}
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

                {/* Feature pills */}
                <div className="mt-12 flex flex-wrap justify-center gap-4 text-sm text-shell-muted">
                    {[
                        { icon: '📐', label: 'Adaptive Blueprints' },
                        { icon: '📊', label: 'Psychometric Analytics' },
                        { icon: '🔒', label: 'Secure Exam Delivery' },
                    ].map((f) => (
                        <span
                            key={f.label}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-shell-border bg-shell-surface/50"
                        >
                            {f.icon} {f.label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}

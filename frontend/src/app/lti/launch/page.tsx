'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import { Spinner } from '@/components/ui/Spinner';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

// Post-launch resolver. The backend set a refresh cookie and bounced the
// browser here with ?next=<target>. We exchange the cookie for an access token
// and route the user into the target flow (directive §10.4).
function LaunchResolver() {
    const router = useRouter();
    const params = useSearchParams();
    const refreshToken = useAuthStore((s) => s.refreshToken);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const next = params.get('next') || '/';
        let cancelled = false;
        (async () => {
            try {
                await refreshToken();
                if (!cancelled) router.replace(next);
            } catch {
                if (!cancelled) setError('We could not complete your Canvas launch. Please try again.');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [params, refreshToken, router]);

    if (error) {
        return (
            <Card className="max-w-md text-center">
                <h1 className="text-h2 text-foreground mb-2">Launch failed</h1>
                <p className="text-body text-shell-muted mb-4">{error}</p>
                <Button variant="secondary" onClick={() => router.replace('/login')}>
                    Go to sign in
                </Button>
            </Card>
        );
    }

    return (
        <div className="flex flex-col items-center gap-3 text-center">
            <Spinner size="lg" tone="brand" />
            <p className="text-body text-shell-muted">Completing your launch…</p>
        </div>
    );
}

export default function LtiLaunchPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-shell-bg px-4">
            <Suspense fallback={<Spinner size="lg" tone="brand" />}>
                <LaunchResolver />
            </Suspense>
        </div>
    );
}

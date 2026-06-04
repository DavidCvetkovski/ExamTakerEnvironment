'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import PageShell from '@/components/layout/PageShell';
import { BackButton, PageHeader } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';
import ProfileCard from '@/components/account/ProfileCard';
import DisplayNameSection from '@/components/account/DisplayNameSection';
import AppearanceSection from '@/components/account/AppearanceSection';
import AccessibilitySection from '@/components/account/AccessibilitySection';
import SecuritySection from '@/components/account/SecuritySection';
import DangerZone from '@/components/account/DangerZone';

export default function AccountPage() {
    return (
        <Suspense fallback={null}>
            <AccountPageInner />
        </Suspense>
    );
}

function AccountPageInner() {
    const { user } = useAuthStore();
    // L-2: origin-aware back nav — return to where the user came from (§8.4).
    const searchParams = useSearchParams();
    const backHref = searchParams.get('from') ?? '/';

    return (
        <ProtectedRoute>
            <PageShell width="narrow">
                <div className="space-y-6">
                    <BackButton href={backHref} label="Back" />
                    <PageHeader title="Account" subtitle="Your profile and preferences." />

                    {user && <ProfileCard user={user} />}
                    <DisplayNameSection />
                    <AppearanceSection />
                    <AccessibilitySection />
                    <SecuritySection />
                    <DangerZone />
                </div>
            </PageShell>
        </ProtectedRoute>
    );
}

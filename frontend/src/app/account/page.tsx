'use client';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import PageShell from '@/components/layout/PageShell';
import { BackButton, PageHeader } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';
import ProfileCard from '@/components/account/ProfileCard';
import AppearanceSection from '@/components/account/AppearanceSection';
import SecuritySection from '@/components/account/SecuritySection';
import DangerZone from '@/components/account/DangerZone';

export default function AccountPage() {
    const { user } = useAuthStore();

    return (
        <ProtectedRoute>
            <PageShell width="narrow">
                <div className="space-y-6">
                    <BackButton href="/" label="Back" />
                    <PageHeader title="Account" subtitle="Your profile and preferences." />

                    {user && <ProfileCard user={user} />}
                    <AppearanceSection />
                    <SecuritySection />
                    <DangerZone />
                </div>
            </PageShell>
        </ProtectedRoute>
    );
}

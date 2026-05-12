'use client';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import PageShell from '@/components/layout/PageShell';
import { Avatar, BackButton, EmptyState, PageHeader } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';

export default function AccountPage() {
    const { user } = useAuthStore();

    return (
        <ProtectedRoute>
            <PageShell width="narrow">
                <div className="space-y-6">
                    <BackButton href="/" label="Back" />
                    <PageHeader title="Account" subtitle="Your profile and preferences." />

                    {user && (
                        <div className="rounded-2xl border border-shell-border bg-shell-surface px-6 py-5 flex items-center gap-4">
                            <Avatar email={user.email} size="lg" />
                            <div className="min-w-0 flex-1">
                                <p className="text-body font-medium text-foreground truncate">{user.email}</p>
                                <p className="text-meta text-shell-muted-dim">{user.role}</p>
                            </div>
                        </div>
                    )}

                    <EmptyState
                        title="Settings coming soon"
                        description="Password changes, theme preference persistence, and data export will live here. For now, theme toggling and sign-out are available from the header."
                    />
                </div>
            </PageShell>
        </ProtectedRoute>
    );
}

'use client';

import { useAuthStore } from '@/stores/useAuthStore';
import PageHeader from '@/components/ui/PageHeader';
import LtiSection from '@/components/integrations/LtiSection';
import SisSection from '@/components/integrations/SisSection';
import QtiSection from '@/components/integrations/QtiSection';

export default function IntegrationsPage() {
    const user = useAuthStore((s) => s.user);
    const isAdmin = user?.role === 'ADMIN';

    return (
        <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-8 space-y-10">
            <PageHeader
                title="Integrations"
                subtitle="LTI 1.3, SIS / Osiris, and QTI interoperability."
            />
            {isAdmin && <LtiSection />}
            {isAdmin && <SisSection />}
            <QtiSection />
        </div>
    );
}

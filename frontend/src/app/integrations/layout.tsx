'use client';

import { ReactNode } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

// Integrations are staff-only; constructors get the QTI tools, admins get
// everything. Students never reach this surface.
export default function IntegrationsLayout({ children }: { children: ReactNode }) {
    return <ProtectedRoute allowedRoles={['ADMIN', 'CONSTRUCTOR']}>{children}</ProtectedRoute>;
}

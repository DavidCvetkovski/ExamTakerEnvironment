'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getHomePathForRole, useAuthStore } from '../../stores/useAuthStore';

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: ('ADMIN' | 'CONSTRUCTOR' | 'REVIEWER' | 'STUDENT')[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { isAuthenticated, isLoading, user, initialize } = useAuthStore();

    // Attempt to restore session from HttpOnly cookie on mount
    useEffect(() => {
        initialize();
    }, [initialize]);

    useEffect(() => {
        if (!isLoading) {
            if (!isAuthenticated) {
                router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
            } else if (allowedRoles && user && !allowedRoles.includes(user.role)) {
                router.push(getHomePathForRole(user.role));
            }
        }
    }, [isLoading, isAuthenticated, user, allowedRoles, router, pathname]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center text-[#A1A1AA] font-sans">
                Validating session...
            </div>
        );
    }

    if (!isAuthenticated || (allowedRoles && user && !allowedRoles.includes(user.role))) {
        return null; // Will redirect in useEffect
    }

    return <>{children}</>;
}

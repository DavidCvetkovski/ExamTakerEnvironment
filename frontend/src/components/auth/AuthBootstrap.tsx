'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * Root-level auth bootstrap (Stage 2, Epoch 8.5).
 *
 * Calls initialize() once when the app mounts so the silent-refresh attempt
 * fires before any ProtectedRoute child renders. Without this, initialize()
 * was only called inside ProtectedRoute — meaning the refresh attempt started
 * on first protected-page mount rather than at the root, causing a brief
 * loading flash on deep links and hard refreshes.
 *
 * ProtectedRoute still calls initialize() too; the function is idempotent
 * (short-circuits immediately when isAuthenticated && user are already set).
 */
export default function AuthBootstrap() {
    const initialize = useAuthStore((s) => s.initialize);

    useEffect(() => {
        initialize();
    }, [initialize]);

    return null;
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import { Avatar, Badge, cn } from '@/components/ui';

export default function AccountMenu() {
    const router = useRouter();
    const { user, logout } = useAuthStore();
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current?.contains(e.target as Node)) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    if (!user) return null;

    const handleSignOut = () => {
        setOpen(false);
        logout();
        router.push('/login');
    };

    const handleAccount = () => {
        setOpen(false);
        router.push('/account');
    };

    return (
        <div ref={wrapRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Account menu"
                className="rounded-full focus-ring transition-transform hover:scale-105"
            >
                <Avatar email={user.email} size="md" />
            </button>
            {open && (
                <div
                    role="menu"
                    className={cn(
                        'absolute right-0 top-full mt-2 z-50 w-64',
                        'rounded-xl border border-shell-border bg-shell-surface shadow-elevated',
                        'py-1',
                    )}
                >
                    <div className="px-4 py-3 border-b border-shell-border">
                        <div className="flex items-center gap-3">
                            <Avatar email={user.email} size="lg" />
                            <div className="min-w-0 flex-1">
                                <p className="text-meta font-medium text-foreground truncate" title={user.email}>
                                    {user.email}
                                </p>
                                <Badge tone="neutral" size="sm">{user.role}</Badge>
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={handleAccount}
                        className="block w-full text-left px-4 py-2 text-meta text-foreground hover:bg-shell-input-alt transition-colors focus-ring"
                    >
                        Account settings
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={handleSignOut}
                        className="block w-full text-left px-4 py-2 text-meta text-[var(--color-danger-fg)] hover:bg-[var(--color-danger-bg)] transition-colors focus-ring"
                    >
                        Sign out
                    </button>
                </div>
            )}
        </div>
    );
}

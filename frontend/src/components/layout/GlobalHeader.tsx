'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MouseEvent } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNavGuardStore } from '@/stores/useNavGuardStore';
import ThemeToggle from '@/components/layout/ThemeToggle';
import AccountMenu from '@/components/layout/AccountMenu';
import { cn, useConfirm } from '@/components/ui';
import { navLinksForRole } from '@/lib/navigation';

export default function GlobalHeader() {
    const pathname = usePathname();
    const router = useRouter();
    const { isAuthenticated, user } = useAuthStore();
    const { isDirty, label, setDirty } = useNavGuardStore();
    const { confirm, ConfirmDialog } = useConfirm();

    if (!isAuthenticated || pathname === '/login' || pathname.startsWith('/exam/')) {
        return null;
    }

    // Stage 18b — when a page has unsaved work, intercept Link clicks and
    // prompt before navigating away. The page itself owns the dirty flag
    // via useNavGuardStore.
    const guardClick = (href: string) => async (e: MouseEvent<HTMLAnchorElement>) => {
        if (!isDirty) return;
        // Let modifier-click / right-click open in a new tab unbothered.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        const ok = await confirm({
            title: 'Leave without saving?',
            message: `You have unsaved ${label}. They will be lost if you leave this page.`,
            confirmLabel: 'Leave',
            tone: 'warning',
        });
        if (ok) {
            setDirty(false);
            router.push(href);
        }
    };

    // Single source shared with the home dashboard tiles (Epoch 14.5).
    const navLinks = navLinksForRole(user?.role);

    const navLinkClass = (active: boolean) =>
        cn(
            'relative px-3 py-1.5 rounded-md text-meta font-medium tracking-tight',
            'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
            active
                ? 'text-foreground bg-shell-input-alt'
                : 'text-shell-muted hover:text-foreground hover:bg-shell-input-alt/60'
        );

    return (
        <>
            {ConfirmDialog}
            <header className="sticky top-0 z-40 bg-shell-surface border-b border-shell-border backdrop-blur-sm">
                <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-14">
                        <div className="flex items-center gap-8 min-w-0">
                            <Link href="/" onClick={guardClick('/')} className="flex items-center gap-2 shrink-0 group">
                                <span className="inline-block w-2 h-2 rounded-full bg-brand transition-transform duration-[var(--duration-normal)] group-hover:scale-125" />
                                <span className="font-semibold text-h3 tracking-tight text-foreground">
                                    OpenVision
                                </span>
                            </Link>
                            <nav className="hidden md:flex items-center gap-0.5">
                                {navLinks.map((link) => {
                                    const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
                                    return (
                                        <Link
                                            key={link.name}
                                            href={link.href}
                                            onClick={guardClick(link.href)}
                                            className={navLinkClass(isActive)}
                                        >
                                            {link.name}
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>

                        <div className="flex items-center gap-3">
                            <ThemeToggle />
                            <AccountMenu />
                        </div>
                    </div>
                </div>

                <div className="md:hidden border-t border-shell-border">
                    <div className="px-2 py-2 flex justify-around overflow-x-auto">
                        {navLinks.map((link) => {
                            const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
                            return (
                                <Link
                                    key={link.name}
                                    href={link.href}
                                    onClick={guardClick(link.href)}
                                    className={navLinkClass(isActive)}
                                >
                                    {link.name}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </header>
        </>
    );
}

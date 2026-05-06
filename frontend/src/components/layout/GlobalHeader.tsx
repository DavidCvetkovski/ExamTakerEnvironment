'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import ThemeToggle from '@/components/layout/ThemeToggle';
import { Badge, cn } from '@/components/ui';

export default function GlobalHeader() {
    const pathname = usePathname();
    const router = useRouter();
    const { isAuthenticated, user, logout } = useAuthStore();

    const handleSignOut = () => {
        logout();           // clears state synchronously
        router.push('/login');  // navigate immediately, don't wait for ProtectedRoute
    };

    if (!isAuthenticated || pathname === '/login' || pathname.startsWith('/exam/')) {
        return null;
    }

    const navLinks =
        user?.role === 'STUDENT'
            ? [{ name: 'My Exams', href: '/my-exams' }]
            : [
                  { name: 'Sessions', href: '/sessions' },
                  { name: 'Blueprints', href: '/blueprint' },
                  { name: 'Library', href: '/items' },
                  { name: 'Grading', href: '/grading' },
                  { name: 'Analytics', href: '/analytics' },
              ];

    const navLinkClass = (active: boolean) =>
        cn(
            'relative px-3 py-1.5 rounded-md text-meta font-medium tracking-tight',
            'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
            active
                ? 'text-foreground bg-shell-input-alt'
                : 'text-shell-muted hover:text-foreground hover:bg-shell-input-alt/60'
        );

    return (
        <header className="sticky top-0 z-40 bg-shell-surface border-b border-shell-border backdrop-blur-sm">
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-14">
                    <div className="flex items-center gap-8 min-w-0">
                        <Link href="/" className="flex items-center gap-2 shrink-0 group">
                            <span className="inline-block w-2 h-2 rounded-full bg-brand transition-transform duration-[var(--duration-normal)] group-hover:scale-125" />
                            <span className="font-semibold text-h3 tracking-tight text-foreground">
                                OpenVision
                            </span>
                        </Link>
                        <nav className="hidden md:flex items-center gap-0.5">
                            {navLinks.map((link) => {
                                const isActive = pathname.startsWith(link.href);
                                return (
                                    <Link
                                        key={link.name}
                                        href={link.href}
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
                        <div className="hidden sm:flex items-center gap-2">
                            <span className="text-meta text-shell-muted-dim">{user?.email}</span>
                            <Badge tone="neutral" size="sm">
                                {user?.role}
                            </Badge>
                        </div>
                        <button
                            onClick={handleSignOut}
                            className={cn(
                                'text-meta font-medium px-2.5 py-1.5 rounded-md',
                                'text-danger',
                                'transition-colors duration-[var(--duration-fast)]',
                                'hover:bg-[var(--color-danger-bg)]'
                            )}
                        >
                            Sign out
                        </button>
                    </div>
                </div>
            </div>

            <div className="md:hidden border-t border-shell-border">
                <div className="px-2 py-2 flex justify-around overflow-x-auto">
                    {navLinks.map((link) => {
                        const isActive = pathname.startsWith(link.href);
                        return (
                            <Link
                                key={link.name}
                                href={link.href}
                                className={navLinkClass(isActive)}
                            >
                                {link.name}
                            </Link>
                        );
                    })}
                </div>
            </div>
        </header>
    );
}

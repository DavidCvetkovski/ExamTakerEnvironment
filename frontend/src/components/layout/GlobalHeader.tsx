'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';

export default function GlobalHeader() {
    const pathname = usePathname();
    const { isAuthenticated, user, logout } = useAuthStore();

    // Do not show header on login page or exam delivery pages
    if (!isAuthenticated || pathname === '/login' || pathname.startsWith('/exam/')) {
        return null;
    }

    const navLinks = [
        { name: 'Question Library', href: '/items' },
        { name: 'Test Blueprints', href: '/blueprint' },
        { name: 'Authoring Workbench', href: '/author' },
    ];

    return (
        <header className="bg-gray-900 text-white shadow-md border-b border-gray-800 shrink-0">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16 items-center">
                    <div className="flex items-center space-x-8">
                        <div className="flex-shrink-0 flex items-center">
                            <span className="font-bold text-xl tracking-tight text-blue-400">OpenVision</span>
                        </div>
                        <nav className="hidden md:flex space-x-1">
                            {navLinks.map((link) => {
                                const isActive = pathname.startsWith(link.href);
                                return (
                                    <Link
                                        key={link.name}
                                        href={link.href}
                                        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive
                                                ? 'bg-gray-800 text-white'
                                                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                            }`}
                                    >
                                        {link.name}
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="text-sm text-gray-400 hidden sm:block">
                            <span className="font-medium text-gray-200">{user?.email}</span>
                            <span className="ml-2 px-2 py-0.5 rounded text-xs bg-gray-800 border border-gray-700">
                                {user?.role}
                            </span>
                        </div>
                        <button
                            onClick={logout}
                            className="text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 px-3 py-2 rounded-md transition-colors"
                        >
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile navigation */}
            <div className="md:hidden border-t border-gray-800 bg-gray-900/50">
                <div className="px-2 pt-2 pb-3 space-y-1 flex justify-around overflow-x-auto">
                    {navLinks.map((link) => {
                        const isActive = pathname.startsWith(link.href);
                        return (
                            <Link
                                key={link.name}
                                href={link.href}
                                className={`px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap ${isActive
                                        ? 'bg-gray-800 text-white'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    }`}
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

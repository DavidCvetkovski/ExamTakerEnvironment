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

    const navLinks = user?.role === 'STUDENT'
        ? [{ name: 'My Exams', href: '/my-exams' }]
        : [
            { name: 'Session Manager', href: '/sessions' },
            { name: 'Test Blueprints', href: '/blueprint' },
            { name: 'Question Library', href: '/items' },
            { name: 'Authoring Workbench', href: '/author' },
            { name: 'Grading', href: '/grading' },
            { name: 'Analytics', href: '/analytics' },
        ];

    const isStudentShell = user?.role === 'STUDENT';

    return (
        <header className={`${isStudentShell ? 'bg-[#fffaf0] text-slate-900 border-b border-[#e8dcc7]' : 'bg-gray-900 text-white border-b border-gray-800'} shadow-md shrink-0`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16 items-center">
                    <div className="flex items-center space-x-8">
                        <div className="flex-shrink-0 flex items-center">
                            <span className={`font-bold text-xl tracking-tight ${isStudentShell ? 'text-[#1055cc]' : 'text-blue-400'}`}>OpenVision</span>
                        </div>
                        <nav className="hidden md:flex space-x-1">
                            {navLinks.map((link) => {
                                const isActive = pathname.startsWith(link.href);
                                return (
                                    <Link
                                        key={link.name}
                                        href={link.href}
                                        className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${isStudentShell
                                                ? isActive
                                                    ? 'bg-[#1055cc] text-white'
                                                    : 'text-slate-700 hover:bg-[#e9f0ff] hover:text-[#1055cc]'
                                                : isActive
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
                        <div className={`text-sm hidden sm:block ${isStudentShell ? 'text-slate-500' : 'text-gray-400'}`}>
                            <span className={`font-medium ${isStudentShell ? 'text-slate-800' : 'text-gray-200'}`}>{user?.email}</span>
                            <span className={`ml-2 px-2 py-0.5 rounded text-xs ${isStudentShell ? 'bg-white border border-[#d8c7aa]' : 'bg-gray-800 border border-gray-700'}`}>
                                {user?.role}
                            </span>
                        </div>
                        <button
                            onClick={logout}
                            className={`text-sm font-medium px-3 py-2 rounded-md transition-colors ${isStudentShell
                                    ? 'text-[#b2471f] hover:text-[#8f3411] hover:bg-[#fff0e6]'
                                    : 'text-red-400 hover:text-red-300 hover:bg-red-900/20'
                                }`}
                        >
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile navigation */}
            <div className={`md:hidden border-t ${isStudentShell ? 'border-[#e8dcc7] bg-[#fffaf0]' : 'border-gray-800 bg-gray-900/50'}`}>
                <div className="px-2 pt-2 pb-3 space-y-1 flex justify-around overflow-x-auto">
                    {navLinks.map((link) => {
                        const isActive = pathname.startsWith(link.href);
                        return (
                            <Link
                                key={link.name}
                                href={link.href}
                                className={`px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap ${isStudentShell
                                        ? isActive
                                            ? 'bg-[#1055cc] text-white'
                                            : 'text-slate-600 hover:bg-[#e9f0ff] hover:text-[#1055cc]'
                                        : isActive
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

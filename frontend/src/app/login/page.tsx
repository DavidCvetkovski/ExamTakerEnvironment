'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../stores/useAuthStore';

export default function LoginPage() {
    const router = useRouter();
    const { login, isAuthenticated, isLoading, initialize } = useAuthStore();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Initialize session check on mount
    useEffect(() => {
        initialize();
    }, [initialize]);

    useEffect(() => {
        if (isAuthenticated) {
            router.push('/items'); // Redirect to library dashboard if already logged in
        }
    }, [isAuthenticated, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        try {
            await login(email, password);
            // Let the useEffect handle the redirect
        } catch (err: any) {
            if (!err.response) {
                setError('Cannot connect to the backend server. Please verify that the database and API are running.');
            } else if (err.response.status === 500) {
                setError('Internal server error. The database might be offline or misconfigured.');
            } else {
                setError(err.response.data?.detail || 'Login failed. Please check your credentials and try again.');
            }
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center text-white">
                Loading...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center text-white font-sans">
            <div className="w-full max-w-md bg-[#242424] p-8 space-y-6">
                <h1 className="text-2xl font-bold text-center">OpenVision SSO</h1>
                <div className="bg-[#1A1A1A] border border-[#333] p-4 text-xs space-y-2">
                    <p className="text-blue-400 font-bold uppercase tracking-wider text-[10px]">Test Credentials</p>
                    <div className="grid grid-cols-1 gap-1 text-[#A1A1AA]">
                        <p><span className="w-20 inline-block">Admin:</span> <code className="text-white">admin_e2e@vu.nl</code></p>
                        <p><span className="w-20 inline-block">Constructor:</span> <code className="text-white">constructor_e2e@vu.nl</code></p>
                        <p><span className="w-20 inline-block">Student:</span> <code className="text-white">student_e2e@vu.nl</code></p>
                        <p className="mt-1 pt-1 border-t border-[#333]"><span className="w-20 inline-block font-bold">Password:</span> <code className="text-white">*pass123</code></p>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 text-sm rounded">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-medium">Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="bg-[#1A1A1A] border border-[#333] p-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>

                    <div className="flex flex-col space-y-2">
                        <label className="text-sm font-medium">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="bg-[#1A1A1A] border border-[#333] p-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 p-2 text-white mt-4 transition-colors font-medium border border-transparent disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Authenticating...' : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
}

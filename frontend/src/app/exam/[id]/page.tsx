'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useExamStore } from '@/stores/useExamStore';

export default function ExamPage() {
    const params = useParams();
    const router = useRouter();
    const sessionId = params.id as string;
    const { currentSession, isLoading, error, fetchSession } = useExamStore();
    const [timeLeft, setTimeLeft] = useState<string>('');

    useEffect(() => {
        if (sessionId) {
            fetchSession(sessionId);
        }
    }, [sessionId, fetchSession]);

    // Timer logic
    useEffect(() => {
        if (!currentSession) return;

        const interval = setInterval(() => {
            const now = new Date().getTime();
            // Safely parse naive datetime strings as UTC
            const tzExpiresAt = currentSession.expires_at.endsWith('Z') || currentSession.expires_at.includes('+')
                ? currentSession.expires_at
                : `${currentSession.expires_at}Z`;
            const end = new Date(tzExpiresAt).getTime();
            const diff = end - now;

            if (diff <= 0) {
                setTimeLeft('EXPIRED');
                clearInterval(interval);
            } else {
                const minutes = Math.floor(diff / 1000 / 60);
                const seconds = Math.floor((diff / 1000) % 60);
                setTimeLeft(`${minutes}m ${seconds}s`);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [currentSession]);

    if (isLoading) return <div className="p-10 text-center">Loading exam session...</div>;
    if (error) return <div className="p-10 text-red-500 text-center">{error}</div>;
    if (!currentSession) return null;

    return (
        <ProtectedRoute allowedRoles={['STUDENT', 'CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
                {/* Header / Timer Bar */}
                <header className="sticky top-0 z-10 bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center shadow-lg">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-xl">OV</div>
                        <h1 className="text-lg font-bold">Exam Session</h1>
                    </div>

                    <div className="flex items-center gap-8">
                        <div className="text-right">
                            <p className="text-xs text-gray-400 uppercase tracking-wider">Time Remaining</p>
                            <p className={`text-xl font-mono font-bold ${timeLeft === 'EXPIRED' ? 'text-red-500' : 'text-indigo-400'}`}>
                                {timeLeft}
                            </p>
                        </div>
                        <button
                            className="bg-indigo-600 hover:bg-indigo-500 px-6 py-2 rounded-lg font-semibold transition-colors shadow-md"
                            onClick={() => alert("Submission logic in Stage 5")}
                        >
                            Submit Exam
                        </button>
                    </div>
                </header>

                <main className="flex-1 max-w-4xl w-full mx-auto p-8 space-y-12">
                    <div className="bg-gray-800 border border-gray-700 p-8 rounded-2xl">
                        <h2 className="text-2xl font-bold mb-2">Instructions</h2>
                        <p className="text-gray-400">
                            The following questions have been selected and frozen for this session.
                            Your work is automatically saved... (not actually implemented yet).
                        </p>
                    </div>

                    <div className="space-y-12 pb-20">
                        {currentSession.items.map((item, idx) => (
                            <section key={item.item_version_id} className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden shadow-sm hover:border-gray-600 transition-colors">
                                <div className="bg-gray-700/50 px-6 py-3 border-b border-gray-700 flex justify-between items-center">
                                    <span className="text-sm font-semibold text-gray-400 uppercase tracking-widest">Question {idx + 1}</span>
                                    <span className="text-xs bg-gray-600 px-2 py-0.5 rounded text-gray-300">v{item.version_number}</span>
                                </div>

                                <div className="p-8 space-y-6">
                                    {/* Question Content */}
                                    <div
                                        className="prose prose-invert max-w-none text-xl leading-relaxed"
                                        dangerouslySetInnerHTML={{ __html: item.content.text || '' }}
                                    />

                                    {/* Options Area (Placeholder for Interactivity) */}
                                    <div className="space-y-3 pt-6">
                                        {item.question_type === 'MULTIPLE_CHOICE' && item.options.choices?.map((choice: any, cIdx: number) => (
                                            <label
                                                key={cIdx}
                                                className="flex items-center gap-4 p-4 rounded-xl border border-gray-700 bg-gray-900/50 hover:bg-gray-700/30 cursor-pointer transition-colors"
                                            >
                                                <input type="radio" name={`q-${idx}`} className="w-5 h-5 text-indigo-600 bg-gray-700 border-gray-600 focus:ring-indigo-600" />
                                                <span className="text-gray-200">{choice.text}</span>
                                            </label>
                                        ))}
                                        {item.question_type === 'ESSAY' && (
                                            <textarea
                                                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder-gray-600"
                                                placeholder="Type your response here..."
                                                rows={6}
                                            />
                                        )}
                                    </div>
                                </div>
                            </section>
                        ))}
                    </div>
                </main>
            </div>
        </ProtectedRoute>
    );
}

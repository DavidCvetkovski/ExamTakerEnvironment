'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useExamStore } from '@/stores/useExamStore';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import QuestionRenderer from '@/components/exam/QuestionRenderer';
import TimelineNavigator from '@/components/exam/TimelineNavigator';
import SaveIndicator from '@/components/exam/SaveIndicator';
import ReviewSummary from '@/components/exam/ReviewSummary';
import SubmissionConfirmation from '@/components/exam/SubmissionConfirmation';

export default function ExamPage() {
    const params = useParams();
    const sessionId = params.id as string;
    const {
        currentSession,
        isLoading,
        error,
        currentQuestionIndex,
        fetchSession,
        loadSavedAnswers,
        navigateTo,
        submitExam,
    } = useExamStore();

    const [timeLeft, setTimeLeft] = useState<string>('');
    const [showReview, setShowReview] = useState(false);

    // Initialize heartbeat auto-save
    useHeartbeat(sessionId);

    // Fetch session and recover saved answers on mount
    useEffect(() => {
        if (sessionId) {
            fetchSession(sessionId).then(() => {
                loadSavedAnswers(sessionId);
            });
        }
    }, [sessionId, fetchSession, loadSavedAnswers]);

    // Timer logic
    useEffect(() => {
        if (!currentSession) return;

        const interval = setInterval(() => {
            const now = new Date().getTime();
            const tzExpiresAt =
                currentSession.expires_at.endsWith('Z') || currentSession.expires_at.includes('+')
                    ? currentSession.expires_at
                    : `${currentSession.expires_at}Z`;
            const end = new Date(tzExpiresAt).getTime();
            const diff = end - now;

            if (diff <= 0) {
                setTimeLeft('EXPIRED');
                clearInterval(interval);
            } else {
                const hours = Math.floor(diff / 1000 / 60 / 60);
                const minutes = Math.floor((diff / 1000 / 60) % 60);
                const seconds = Math.floor((diff / 1000) % 60);
                setTimeLeft(
                    hours > 0
                        ? `${hours}h ${minutes}m ${seconds}s`
                        : `${minutes}m ${seconds}s`
                );
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [currentSession]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!currentSession) return;
            if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                navigateTo(currentQuestionIndex + 1);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                navigateTo(currentQuestionIndex - 1);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentSession, currentQuestionIndex, navigateTo]);

    // Handle submission
    const handleSubmit = async () => {
        try {
            await submitExam(sessionId);
            setShowReview(false);
        } catch {
            // Error is set in the store
        }
    };

    // Loading & Error states
    if (isLoading && !currentSession) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-gray-400">Loading exam session...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8 max-w-md text-center">
                    <p className="text-red-400 font-semibold">{error}</p>
                </div>
            </div>
        );
    }

    if (!currentSession) return null;

    // Show confirmation page if already submitted
    if (currentSession.status === 'SUBMITTED') {
        return (
            <SubmissionConfirmation
                submittedAt={currentSession.submitted_at}
                returnPath={currentSession.return_path}
            />
        );
    }

    const currentItem = currentSession.items[currentQuestionIndex];
    const totalQuestions = currentSession.items.length;
    const isExpired = timeLeft === 'EXPIRED' || currentSession.status === 'EXPIRED';

    return (
        <ProtectedRoute allowedRoles={['STUDENT', 'CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col pb-16">
                {/* Header / Timer Bar */}
                <header className="sticky top-0 z-10 bg-gray-800 border-b border-gray-700 px-6 py-4 flex justify-between items-center shadow-lg">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-xl">
                            OV
                        </div>
                        <h1 className="text-lg font-bold">Exam Session</h1>
                        <SaveIndicator />
                    </div>

                    <div className="flex items-center gap-8">
                        <div className="text-right">
                            <p className="text-xs text-gray-400 uppercase tracking-wider">Time Remaining</p>
                            <p
                                className={`text-xl font-mono font-bold ${isExpired
                                        ? 'text-red-500'
                                        : timeLeft.startsWith('0m') || timeLeft.startsWith('1m') || timeLeft.startsWith('2m')
                                            ? 'text-amber-400 animate-pulse'
                                            : 'text-indigo-400'
                                    }`}
                            >
                                {timeLeft}
                            </p>
                        </div>
                        <button
                            className="bg-indigo-600 hover:bg-indigo-500 px-6 py-2 rounded-lg font-semibold transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => setShowReview(true)}
                            disabled={isExpired}
                        >
                            Submit Exam
                        </button>
                    </div>
                </header>

                {/* Main Question Area */}
                <main className="flex-1 max-w-4xl w-full mx-auto p-8">
                    {isExpired ? (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center">
                            <h2 className="text-xl font-bold text-red-400">Time Expired</h2>
                            <p className="text-gray-400 mt-2">
                                Your exam time has ended. All saved answers have been recorded.
                            </p>
                            <Link
                                href={currentSession.return_path}
                                className="mt-6 inline-flex rounded-xl border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:bg-gray-800"
                            >
                                Back to Home
                            </Link>
                        </div>
                    ) : currentItem ? (
                        <div className="space-y-6">
                            <QuestionRenderer
                                item={currentItem}
                                questionIndex={currentQuestionIndex}
                                totalQuestions={totalQuestions}
                            />

                            {/* Navigation Buttons */}
                            <div className="flex justify-between items-center pt-4">
                                <button
                                    onClick={() => navigateTo(currentQuestionIndex - 1)}
                                    disabled={currentQuestionIndex === 0}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors font-medium disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
                                    </svg>
                                    Previous
                                </button>

                                <span className="text-sm text-gray-500">
                                    {currentQuestionIndex + 1} / {totalQuestions}
                                </span>

                                <button
                                    onClick={() => navigateTo(currentQuestionIndex + 1)}
                                    disabled={currentQuestionIndex === totalQuestions - 1}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    Next
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ) : null}
                </main>

                {/* Timeline Navigator */}
                <TimelineNavigator />

                {/* Review Modal */}
                {showReview && (
                    <ReviewSummary
                        onConfirm={handleSubmit}
                        onCancel={() => setShowReview(false)}
                    />
                )}
            </div>
        </ProtectedRoute>
    );
}

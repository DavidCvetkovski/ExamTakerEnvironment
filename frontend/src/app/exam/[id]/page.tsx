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

    // Timer logic — auto-submits when time expires so the session is graded
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
                clearInterval(interval);
                // Show expired state immediately, then auto-submit.
                // If the submit succeeds, the page transitions to SubmissionConfirmation.
                // If it fails (e.g. backend already expired the session), the expired
                // banner stays and the store's error field surfaces the reason.
                setTimeLeft('EXPIRED');
                submitExam(sessionId);
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
    }, [currentSession, sessionId, submitExam]);

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
            <div className="min-h-screen bg-shell-surface flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-shell-muted">Loading exam session…</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-shell-surface flex items-center justify-center">
                <div className="bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-xl p-8 max-w-md text-center">
                    <p className="text-[var(--color-danger-fg)] font-semibold">{error}</p>
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
            <div className="min-h-screen bg-shell-surface text-foreground flex flex-col pb-16">
                {/* Header / Timer Bar */}
                <header className="sticky top-0 z-10 bg-shell-surface border-b border-shell-border px-6 py-4 flex justify-between items-center shadow-[var(--shadow-card)]">
                    <div className="flex items-center gap-4">
                        <div className="w-9 h-9 bg-brand rounded-md flex items-center justify-center font-semibold text-white text-meta">
                            OV
                        </div>
                        <h1 className="text-h3 font-semibold">Exam session</h1>
                        <SaveIndicator />
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="text-right">
                            <p className="text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim">Time remaining</p>
                            <p
                                className={`text-h2 font-mono font-semibold tabular-nums ${
                                    isExpired
                                        ? 'text-danger'
                                        : timeLeft.startsWith('0m') || timeLeft.startsWith('1m') || timeLeft.startsWith('2m')
                                        ? 'text-[var(--color-warning-fg)] animate-pulse'
                                        : 'text-brand'
                                }`}
                            >
                                {timeLeft}
                            </p>
                        </div>
                        <button
                            className="bg-brand text-white px-5 py-2 rounded-md font-medium text-meta transition-[filter] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => setShowReview(true)}
                            disabled={isExpired}
                        >
                            Submit exam
                        </button>
                    </div>
                </header>

                {/* Main Question Area */}
                <main className="flex-1 max-w-4xl w-full mx-auto p-8">
                    {isExpired ? (
                        <div className="bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-xl p-8 text-center">
                            <h2 className="text-h2 text-[var(--color-danger-fg)]">Time expired</h2>
                            <p className="text-shell-muted mt-2 text-meta">
                                Your exam time has ended. All saved answers have been recorded.
                            </p>
                            <Link
                                href={currentSession.return_path}
                                className="mt-6 inline-flex rounded-md border border-shell-border-deep px-4 py-2 text-meta font-medium text-foreground transition hover:bg-shell-input-alt"
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
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-shell-border bg-shell-surface text-foreground hover:bg-shell-input-alt hover:border-shell-border-deep transition-colors font-medium text-meta disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
                                    </svg>
                                    Previous
                                </button>

                                <span className="text-sm text-shell-muted-dim">
                                    {currentQuestionIndex + 1} / {totalQuestions}
                                </span>

                                <button
                                    onClick={() => navigateTo(currentQuestionIndex + 1)}
                                    disabled={currentQuestionIndex === totalQuestions - 1}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white font-medium text-meta transition-[filter] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
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

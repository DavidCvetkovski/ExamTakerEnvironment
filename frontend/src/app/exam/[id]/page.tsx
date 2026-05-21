'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useExamStore } from '@/stores/useExamStore';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import QuestionRenderer from '@/components/exam/QuestionRenderer';
import ExamFooter from '@/components/exam/ExamFooter';
import SaveIndicator from '@/components/exam/SaveIndicator';
import ReviewSummary from '@/components/exam/ReviewSummary';
import SubmissionConfirmation from '@/components/exam/SubmissionConfirmation';
import { Button, Spinner } from '@/components/ui';

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
                // The session may already be expired server-side; swallow the
                // rejection so it doesn't surface as an unhandled runtime error.
                // The expired banner is shown and the store holds the reason.
                void submitExam(sessionId).catch(() => {});
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
                    <Spinner size="xl" className="mx-auto" />
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
                mode={currentSession.session_mode}
            />
        );
    }

    const currentItem = currentSession.items[currentQuestionIndex];
    const totalQuestions = currentSession.items.length;
    const isExpired = timeLeft === 'EXPIRED' || currentSession.status === 'EXPIRED';

    return (
        <ProtectedRoute allowedRoles={['STUDENT', 'CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-screen bg-shell-surface text-foreground flex flex-col pb-28">
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
                        <Button
                            variant="primary"
                            size="md"
                            disabled={isExpired}
                            onClick={() => setShowReview(true)}
                        >
                            Submit exam
                        </Button>
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
                        <QuestionRenderer
                            item={currentItem}
                            questionIndex={currentQuestionIndex}
                            totalQuestions={totalQuestions}
                        />
                    ) : null}
                </main>

                {/* Composite sticky footer: Prev/Next + timeline */}
                <ExamFooter />

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

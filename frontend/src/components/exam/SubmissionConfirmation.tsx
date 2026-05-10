'use client';

import Link from 'next/link';

interface SubmissionConfirmationProps {
    submittedAt: string | null;
    returnPath: string;
    mode?: 'ASSIGNED' | 'PRACTICE';
}

export default function SubmissionConfirmation({ submittedAt, returnPath, mode = 'ASSIGNED' }: SubmissionConfirmationProps) {
    if (mode === 'PRACTICE') {
        return <PracticeCompletionScreen returnPath={returnPath} submittedAt={submittedAt} />;
    }

    const formattedTime = submittedAt
        ? new Date(submittedAt.endsWith('Z') ? submittedAt : `${submittedAt}Z`).toLocaleString()
        : 'Just now';
    const returnLabel = returnPath === '/my-exams' ? 'Back to My Exams' : 'Back to Session Manager';

    return (
        <div className="min-h-screen bg-shell-surface text-foreground flex items-center justify-center p-8">
            <div className="max-w-md w-full text-center space-y-8">
                <div className="w-20 h-20 mx-auto bg-[var(--color-success-bg)] border-2 border-[var(--color-success-border)] rounded-full flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-[var(--color-success-fg)]">
                        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
                    </svg>
                </div>

                <div className="space-y-3">
                    <h1 className="text-2xl font-bold text-[var(--color-success-fg)]">Exam Submitted Successfully</h1>
                    <p className="text-shell-muted">Your answers have been recorded. Use the button below to return to your home screen.</p>
                </div>

                <div className="bg-shell-input border border-shell-border-deep rounded-xl p-6 space-y-3 text-left">
                    <div className="flex justify-between text-sm">
                        <span className="text-shell-muted">Submitted at</span>
                        <span className="text-shell-muted">{formattedTime}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-shell-muted">Status</span>
                        <span className="px-2 py-0.5 bg-[var(--color-success-bg)] text-[var(--color-success-fg)] rounded text-xs font-semibold">SUBMITTED</span>
                    </div>
                </div>

                <div className="space-y-3">
                    <Link href={returnPath} className="inline-flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand/90">
                        {returnLabel}
                    </Link>
                    <p className="text-xs text-shell-muted-dim">Results will be available once your instructor publishes them.</p>
                </div>
            </div>
        </div>
    );
}

function PracticeCompletionScreen({ returnPath, submittedAt }: { returnPath: string; submittedAt: string | null }) {
    const formattedTime = submittedAt
        ? new Date(submittedAt.endsWith('Z') ? submittedAt : `${submittedAt}Z`).toLocaleString()
        : 'Just now';

    return (
        <div className="min-h-screen bg-shell-surface text-foreground flex items-center justify-center p-8">
            <div className="max-w-md w-full text-center space-y-8">
                <div className="w-20 h-20 mx-auto bg-brand/10 border-2 border-brand/40 rounded-full flex items-center justify-center">
                    <span className="text-3xl" role="img" aria-label="Practice">🧪</span>
                </div>

                <div className="space-y-3">
                    <h1 className="text-2xl font-bold text-brand">Practice Run Complete</h1>
                    <p className="text-shell-muted leading-relaxed">
                        This was a practice session — your answers were <strong className="text-foreground">not submitted</strong> for grading.
                    </p>
                </div>

                <div className="bg-shell-input border border-shell-border-deep rounded-xl p-5 text-left space-y-3">
                    <p className="text-xs font-semibold text-shell-muted uppercase tracking-wide mb-3">Practice sessions help you:</p>
                    {[
                        'Familiarise yourself with the question format',
                        'Check the time pressure',
                        'Identify knowledge gaps before the real exam',
                    ].map((item) => (
                        <div key={item} className="flex items-start gap-2 text-sm text-foreground">
                            <span className="text-brand shrink-0 mt-0.5">✓</span>
                            <span>{item}</span>
                        </div>
                    ))}
                </div>

                <div className="flex justify-between text-xs text-shell-muted-dim px-1">
                    <span>Completed at</span>
                    <span>{formattedTime}</span>
                </div>

                <Link href={returnPath} className="inline-flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand/90">
                    Back to Blueprint
                </Link>
            </div>
        </div>
    );
}

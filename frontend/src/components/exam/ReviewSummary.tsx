'use client';

import { useExamStore } from '@/stores/useExamStore';

interface ReviewSummaryProps {
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * Pre-submission review screen showing a summary of answered,
 * unanswered, and flagged questions. Students can click items
 * to jump back to specific questions before confirming submission.
 */
export default function ReviewSummary({ onConfirm, onCancel }: ReviewSummaryProps) {
    const { currentSession, answers, flags, navigateTo } = useExamStore();

    if (!currentSession) return null;

    const items = currentSession.items;
    const answeredItems = items.filter((item) => !!answers[item.learning_object_id]);
    const unansweredItems = items.filter((item) => !answers[item.learning_object_id]);
    const flaggedItems = items.filter((item) => flags[item.learning_object_id]);

    const handleJumpTo = (loId: string) => {
        const idx = items.findIndex((item) => item.learning_object_id === loId);
        if (idx >= 0) {
            navigateTo(idx);
            onCancel(); // Close review to show the question
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-shell-input border border-shell-border-deep rounded-2xl max-w-lg w-full shadow-2xl">
                {/* Header */}
                <div className="px-6 py-5 border-b border-shell-border-deep">
                    <h2 className="text-xl font-bold text-foreground">Review Before Submission</h2>
                    <p className="text-sm text-shell-muted mt-1">
                        Please review your progress before submitting. Once submitted, you cannot make changes.
                    </p>
                </div>

                {/* Summary Stats */}
                <div className="px-6 py-5 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-[var(--color-success-bg)] border border-[var(--color-success-border)] rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-[var(--color-success-fg)]">{answeredItems.length}</p>
                            <p className="text-eyebrow text-[var(--color-success-fg)]/80 uppercase tracking-wider mt-1">Answered</p>
                        </div>
                        <div className="bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-[var(--color-danger-fg)]">{unansweredItems.length}</p>
                            <p className="text-eyebrow text-[var(--color-danger-fg)]/80 uppercase tracking-wider mt-1">Unanswered</p>
                        </div>
                        <div className="bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-[var(--color-warning-fg)]">{flaggedItems.length}</p>
                            <p className="text-eyebrow text-[var(--color-warning-fg)]/80 uppercase tracking-wider mt-1">Flagged</p>
                        </div>
                    </div>

                    {/* Unanswered question list */}
                    {unansweredItems.length > 0 && (
                        <div className="bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-xl p-4">
                            <p className="text-sm font-semibold text-[var(--color-danger-fg)] mb-2">Unanswered questions</p>
                            <div className="flex flex-wrap gap-2">
                                {unansweredItems.map((item) => {
                                    const idx = items.findIndex((i) => i.learning_object_id === item.learning_object_id);
                                    return (
                                        <button
                                            key={item.learning_object_id}
                                            onClick={() => handleJumpTo(item.learning_object_id)}
                                            className="px-3 py-1 bg-[var(--color-danger-bg)] hover:brightness-110 border border-[var(--color-danger-border)] rounded-lg text-[var(--color-danger-fg)] text-sm transition-colors"
                                        >
                                            Q{idx + 1}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Flagged question list */}
                    {flaggedItems.length > 0 && (
                        <div className="bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] rounded-xl p-4">
                            <p className="text-sm font-semibold text-[var(--color-warning-fg)] mb-2">Flagged for review</p>
                            <div className="flex flex-wrap gap-2">
                                {flaggedItems.map((item) => {
                                    const idx = items.findIndex((i) => i.learning_object_id === item.learning_object_id);
                                    return (
                                        <button
                                            key={item.learning_object_id}
                                            onClick={() => handleJumpTo(item.learning_object_id)}
                                            className="px-3 py-1 bg-[var(--color-warning-bg)] hover:brightness-110 border border-[var(--color-warning-border)] rounded-lg text-[var(--color-warning-fg)] text-sm transition-colors"
                                        >
                                            Q{idx + 1}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="px-6 py-4 border-t border-shell-border-deep flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-5 py-2.5 rounded-lg border border-shell-border-deep text-shell-muted hover:bg-shell-input-alt transition-colors font-medium"
                    >
                        Go Back
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-5 py-2.5 rounded-lg bg-brand hover:bg-brand text-white font-semibold transition-colors shadow-lg"
                    >
                        Confirm Submission
                    </button>
                </div>
            </div>
        </div>
    );
}

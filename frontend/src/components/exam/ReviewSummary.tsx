'use client';

import { useExamStore } from '@/stores/useExamStore';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

interface ReviewSummaryProps {
    onConfirm: () => void;
    onCancel: () => void;
    /** Disables the confirm button + shows a spinner while a submit is in flight (H-7). */
    isSubmitting?: boolean;
}

/**
 * Pre-submission review screen showing a summary of answered,
 * unanswered, and flagged questions. Students can click items
 * to jump back to specific questions before confirming submission.
 */
export default function ReviewSummary({ onConfirm, onCancel, isSubmitting = false }: ReviewSummaryProps) {
    const { currentSession, answers, flags, navigateTo } = useExamStore();

    if (!currentSession) return null;

    const items = currentSession.items;
    // H-6: make the three buckets mutually exclusive so the counts sum to the
    // total and no question appears in two lists. Flagged is its own bucket
    // (whether answered or not); answered/unanswered exclude flagged.
    // L-15: test key presence, not truthiness, so a falsy answer payload counts.
    const flaggedIds = new Set(
        items.filter((item) => flags[item.learning_object_id]).map((item) => item.learning_object_id),
    );
    const isAnswered = (loId: string) => loId in answers;
    const answeredItems = items.filter(
        (item) => isAnswered(item.learning_object_id) && !flaggedIds.has(item.learning_object_id),
    );
    const unansweredItems = items.filter(
        (item) => !isAnswered(item.learning_object_id) && !flaggedIds.has(item.learning_object_id),
    );
    const flaggedItems = items.filter((item) => flaggedIds.has(item.learning_object_id));

    const handleJumpTo = (loId: string) => {
        const idx = items.findIndex((item) => item.learning_object_id === loId);
        if (idx >= 0) {
            navigateTo(idx);
            onCancel(); // Close review to show the question
        }
    };

    return (
        <Modal
            isOpen
            onClose={onCancel}
            blockBackdropClose={isSubmitting}
            title="Review Before Submission"
            size="md"
            footer={
                <>
                    <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
                        Go Back
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={onConfirm}
                        disabled={isSubmitting}
                        loading={isSubmitting}
                    >
                        Confirm Submission
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <p className="text-body text-shell-muted leading-relaxed">
                    Please review your progress before submitting. Once submitted, you cannot make changes.
                </p>

                {/* Summary Stats */}
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
                                        type="button"
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
                                        type="button"
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
        </Modal>
    );
}

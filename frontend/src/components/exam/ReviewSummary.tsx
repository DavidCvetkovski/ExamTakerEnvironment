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
            <div className="bg-gray-800 border border-gray-700 rounded-2xl max-w-lg w-full shadow-2xl">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-gray-100">Review Before Submission</h2>
                    <p className="text-sm text-gray-400 mt-1">
                        Please review your progress before submitting. Once submitted, you cannot make changes.
                    </p>
                </div>

                {/* Summary Stats */}
                <div className="px-6 py-5 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-emerald-400">{answeredItems.length}</p>
                            <p className="text-xs text-emerald-400/70 uppercase tracking-wider mt-1">Answered</p>
                        </div>
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-red-400">{unansweredItems.length}</p>
                            <p className="text-xs text-red-400/70 uppercase tracking-wider mt-1">Unanswered</p>
                        </div>
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-amber-400">{flaggedItems.length}</p>
                            <p className="text-xs text-amber-400/70 uppercase tracking-wider mt-1">Flagged</p>
                        </div>
                    </div>

                    {/* Unanswered question list */}
                    {unansweredItems.length > 0 && (
                        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                            <p className="text-sm font-semibold text-red-400 mb-2">⚠ Unanswered Questions</p>
                            <div className="flex flex-wrap gap-2">
                                {unansweredItems.map((item) => {
                                    const idx = items.findIndex((i) => i.learning_object_id === item.learning_object_id);
                                    return (
                                        <button
                                            key={item.learning_object_id}
                                            onClick={() => handleJumpTo(item.learning_object_id)}
                                            className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm transition-colors"
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
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                            <p className="text-sm font-semibold text-amber-400 mb-2">🚩 Flagged for Review</p>
                            <div className="flex flex-wrap gap-2">
                                {flaggedItems.map((item) => {
                                    const idx = items.findIndex((i) => i.learning_object_id === item.learning_object_id);
                                    return (
                                        <button
                                            key={item.learning_object_id}
                                            onClick={() => handleJumpTo(item.learning_object_id)}
                                            className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-300 text-sm transition-colors"
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
                <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-5 py-2.5 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors font-medium"
                    >
                        Go Back
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors shadow-lg"
                    >
                        Confirm Submission
                    </button>
                </div>
            </div>
        </div>
    );
}

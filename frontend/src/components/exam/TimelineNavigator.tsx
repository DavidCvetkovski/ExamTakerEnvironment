'use client';

import { useExamStore } from '@/stores/useExamStore';

/**
 * Visual timeline bar displayed at the bottom of the exam screen.
 * Shows one cell per question with color-coded states:
 * - Gray: unanswered
 * - Indigo: answered
 * - Green ring: current question
 * - Amber flag icon: flagged for review
 *
 * Click any cell to jump to that question.
 */
export default function TimelineNavigator() {
    const {
        currentSession,
        currentQuestionIndex,
        answers,
        flags,
        navigateTo,
    } = useExamStore();

    if (!currentSession) return null;

    const items = currentSession.items;
    const answeredCount = items.filter((item) => answers[item.learning_object_id]).length;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-800/95 backdrop-blur-sm border-t border-gray-700 z-20">
            <div className="max-w-6xl mx-auto px-6 py-3">
                <div className="flex items-center gap-3">
                    {/* Summary */}
                    <div className="text-xs text-gray-400 whitespace-nowrap mr-2">
                        <span className="text-indigo-400 font-semibold">{answeredCount}</span>
                        <span> / {items.length} answered</span>
                    </div>

                    {/* Timeline cells */}
                    <div className="flex items-center gap-1.5 overflow-x-auto py-1 flex-1 scrollbar-thin">
                        {items.map((item, idx) => {
                            const isAnswered = !!answers[item.learning_object_id];
                            const isFlagged = flags[item.learning_object_id] || false;
                            const isCurrent = idx === currentQuestionIndex;

                            return (
                                <button
                                    key={item.item_version_id}
                                    onClick={() => navigateTo(idx)}
                                    className={`relative flex-shrink-0 w-8 h-8 rounded-lg text-xs font-semibold transition-all duration-150 ${isCurrent
                                            ? 'bg-emerald-500/20 border-2 border-emerald-400 text-emerald-300 scale-110'
                                            : isAnswered
                                                ? 'bg-indigo-500/20 border border-indigo-500/60 text-indigo-300 hover:bg-indigo-500/30'
                                                : 'bg-gray-700/50 border border-gray-600 text-gray-500 hover:bg-gray-600/50 hover:text-gray-400'
                                        }`}
                                    title={`Question ${idx + 1}${isAnswered ? ' (answered)' : ''}${isFlagged ? ' (flagged)' : ''}`}
                                >
                                    {idx + 1}
                                    {isFlagged && (
                                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border border-gray-800" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

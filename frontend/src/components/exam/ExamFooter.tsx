'use client';

import { useExamStore } from '@/stores/useExamStore';

/**
 * Composite sticky footer for the exam-take surface (Stage 10, Epoch 8.5).
 *
 * Replaces the inline Prev/Next row (which scrolled off-screen on short viewports)
 * and the separate <TimelineNavigator> with a single fixed surface:
 *   - Top row: Prev / Next navigation (always visible)
 *   - Bottom row: timeline strip (one cell per question)
 *
 * At viewport heights ≤ 480 px the footer un-sticks and scrolls with the page
 * so it doesn't consume content space it no longer has.
 * z-30 aligns with the sticky-surface layer per CLAUDE.md §7.4.1.
 */
export default function ExamFooter() {
    const {
        currentSession,
        currentQuestionIndex,
        answers,
        flags,
        navigateTo,
    } = useExamStore();

    if (!currentSession) return null;

    const items = currentSession.items;
    const totalQuestions = items.length;
    const answeredCount = items.filter((item) => answers[item.learning_object_id]).length;
    const canPrev = currentQuestionIndex > 0;
    const canNext = currentQuestionIndex < totalQuestions - 1;

    return (
        /*
         * `max-h-[480px]:` is a Tailwind max-height media-query variant.
         * Below 480 px viewport height: position becomes static (footer scrolls
         * with the page). Above: position is fixed, content scrolls beneath it.
         */
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-shell-input/95 backdrop-blur-sm border-t border-shell-border-deep [@media(max-height:480px)]:static">

            {/* Prev / Next row */}
            <div className="max-w-4xl mx-auto px-6 py-2 flex items-center justify-between gap-4 border-b border-shell-border-deep/50">
                <button
                    type="button"
                    onClick={() => navigateTo(currentQuestionIndex - 1)}
                    disabled={!canPrev}
                    className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-md border border-shell-border bg-shell-surface text-foreground font-medium text-meta transition-colors hover:bg-shell-input-alt hover:border-shell-border-deep disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                        <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
                    </svg>
                    Previous
                </button>

                <span className="text-sm text-shell-muted-dim tabular-nums" aria-live="polite">
                    {currentQuestionIndex + 1} / {totalQuestions}
                </span>

                <button
                    type="button"
                    onClick={() => navigateTo(currentQuestionIndex + 1)}
                    disabled={!canNext}
                    className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-md bg-brand text-white font-medium text-meta transition-[filter] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Next
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                        <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>

            {/* Timeline strip */}
            <div className="max-w-4xl mx-auto px-6 py-2.5">
                <div className="flex items-center gap-3">
                    <div className="text-xs text-shell-muted whitespace-nowrap mr-2">
                        <span className="text-brand font-semibold">{answeredCount}</span>
                        <span> / {totalQuestions} answered</span>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 flex-1 scrollbar-thin">
                        {items.map((item, idx) => {
                            const isAnswered = !!answers[item.learning_object_id];
                            const isFlagged = flags[item.learning_object_id] || false;
                            const isCurrent = idx === currentQuestionIndex;

                            return (
                                <button
                                    key={item.item_version_id}
                                    type="button"
                                    onClick={() => navigateTo(idx)}
                                    className={`relative flex-shrink-0 w-8 h-8 rounded-lg text-xs font-semibold transition-all duration-150 ${
                                        isCurrent
                                            ? 'bg-[var(--color-success-bg)] border-2 border-[var(--color-success-border)] text-[var(--color-success-fg)] scale-110'
                                            : isAnswered
                                                ? 'bg-brand/20 border border-brand/60 text-brand hover:bg-brand/30'
                                                : 'bg-shell-input-alt/50 border border-shell-border-deep text-shell-muted-dim hover:bg-shell-input hover:text-shell-muted'
                                    }`}
                                    title={`Question ${idx + 1}${isAnswered ? ' (answered)' : ''}${isFlagged ? ' (flagged)' : ''}`}
                                >
                                    {idx + 1}
                                    {isFlagged && (
                                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-[var(--color-warning)] rounded-full border border-shell-border" />
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

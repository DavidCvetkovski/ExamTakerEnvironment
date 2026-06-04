'use client';

import { useExamStore, ExamItem } from '@/stores/useExamStore';
import { toExamContentHtml } from '@/lib/examContent';
import { sanitizeExamHtml as sanitizeHtml } from '@/lib/sanitizeHtml';
import MCQQuestion from './MCQQuestion';
import MultipleResponseQuestion from './MultipleResponseQuestion';
import EssayQuestion from './EssayQuestion';

interface QuestionRendererProps {
    item: ExamItem;
    questionIndex: number;
    totalQuestions: number;
}

/**
 * Renders a single exam question with its header, content, flag toggle,
 * and the appropriate interactive input component based on question_type.
 */
export default function QuestionRenderer({ item, questionIndex, totalQuestions }: QuestionRendererProps) {
    const { flags, toggleFlag } = useExamStore();
    const isFlagged = flags[item.learning_object_id] || false;

    const handleToggleFlag = () => {
        toggleFlag(item.learning_object_id, item.item_version_id);
    };

    const contentHtml = toExamContentHtml(item.content);

    return (
        <section className="bg-shell-input border border-shell-border-deep rounded-2xl overflow-hidden shadow-sm">
            {/* Question Header */}
            <div className="bg-shell-input-alt/50 px-6 py-3 border-b border-shell-border-deep flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-shell-muted uppercase tracking-widest">
                        Question {questionIndex + 1} of {totalQuestions}
                    </span>
                </div>
                <button
                    onClick={handleToggleFlag}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${isFlagged
                            ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-fg)] border border-[var(--color-warning-border)]'
                            : 'bg-shell-input-alt/50 text-shell-muted border border-shell-border-deep hover:bg-shell-input hover:text-foreground'
                        }`}
                    title={isFlagged ? 'Unflag this question' : 'Flag for review'}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M3.5 2.75a.75.75 0 0 0-1.5 0v14.5a.75.75 0 0 0 1.5 0v-4.392l1.657-.348a6.449 6.449 0 0 1 4.271.572 7.948 7.948 0 0 0 5.965.524l2.078-.64A.75.75 0 0 0 18 12.25v-8.5a.75.75 0 0 0-.904-.734l-2.38.501a7.25 7.25 0 0 1-4.186-.363l-.502-.2a8.75 8.75 0 0 0-5.053-.439l-1.475.31V2.75Z" />
                    </svg>
                    {isFlagged ? 'Flagged' : 'Flag'}
                </button>
            </div>

            {/* Question Content */}
            <div className="p-8 space-y-6">
                <div
                    className="prose prose-invert max-w-none text-xl leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(contentHtml) }}
                />

                {/* Answer Input */}
                <div className="pt-4">
                    {item.question_type === 'MULTIPLE_CHOICE' && (
                        <MCQQuestion item={item} questionIndex={questionIndex} />
                    )}
                    {item.question_type === 'MULTIPLE_RESPONSE' && (
                        <MultipleResponseQuestion item={item} questionIndex={questionIndex} />
                    )}
                    {item.question_type === 'ESSAY' && (
                        <EssayQuestion item={item} questionIndex={questionIndex} />
                    )}
                    {!['MULTIPLE_CHOICE', 'MULTIPLE_RESPONSE', 'ESSAY'].includes(item.question_type) && (
                        <div className="text-shell-muted-dim italic p-4 border border-shell-border-deep rounded-xl">
                            Unsupported question type: {item.question_type}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

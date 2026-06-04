'use client';

import { useExamStore, ExamItem } from '@/stores/useExamStore';
import { getExamChoiceContent } from '@/lib/examContent';
import { sanitizeExamHtml } from '@/lib/sanitizeHtml';

interface MCQQuestionProps {
    item: ExamItem;
    questionIndex: number;
}

/**
 * Interactive Multiple Choice question component.
 * Renders radio buttons and syncs selection to the exam store.
 */
export default function MCQQuestion({ item, questionIndex }: MCQQuestionProps) {
    const { answers, setAnswer } = useExamStore();
    const currentAnswer = answers[item.learning_object_id] as
        | { selected_option_index: number }
        | undefined;

    const choices = getExamChoiceContent(item.options);

    const handleSelect = (optionIndex: number) => {
        const choice = choices[optionIndex];
        setAnswer(
            item.learning_object_id,
            item.item_version_id,
            'MULTIPLE_CHOICE',
            {
                selected_option_index: optionIndex,
                ...(choice?.id ? { selected_option_id: choice.id } : {}),
            }
        );
    };

    return (
        <div className="space-y-3">
            {choices.map((choice, idx) => {
                const isSelected = currentAnswer?.selected_option_index === idx;
                return (
                    <label
                        key={idx}
                        className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-150 ${isSelected
                                ? 'border-brand bg-brand/10 ring-1 ring-brand/50'
                                : 'border-shell-border-deep bg-shell-surface/50 hover:bg-shell-input-alt/30 hover:border-shell-border-deep'
                            }`}
                    >
                        <input
                            type="radio"
                            name={`q-${questionIndex}`}
                            checked={isSelected}
                            onChange={() => handleSelect(idx)}
                            className="w-5 h-5 text-brand bg-shell-input-alt border-shell-border-deep focus:ring-brand focus:ring-offset-0"
                        />
                        <span
                            className="text-foreground"
                            dangerouslySetInnerHTML={{ __html: sanitizeExamHtml(choice.html ?? choice.text) }}
                        />
                    </label>
                );
            })}
        </div>
    );
}

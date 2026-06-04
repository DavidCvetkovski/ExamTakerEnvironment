'use client';

import { useExamStore, ExamItem } from '@/stores/useExamStore';
import { getExamChoiceContent } from '@/lib/examContent';
import { sanitizeExamHtml } from '@/lib/sanitizeHtml';

interface MultipleResponseQuestionProps {
    item: ExamItem;
    questionIndex: number;
}

/**
 * Interactive Multiple Response question component.
 * Renders checkboxes and syncs multi-selection to the exam store.
 */
export default function MultipleResponseQuestion({ item }: MultipleResponseQuestionProps) {
    const { answers, setAnswer } = useExamStore();
    const currentAnswer = answers[item.learning_object_id] as
        | { selected_option_indices: number[] }
        | undefined;

    const selectedIndices = currentAnswer?.selected_option_indices ?? [];
    const choices = getExamChoiceContent(item.options);

    const handleToggle = (optionIndex: number) => {
        const newIndices = selectedIndices.includes(optionIndex)
            ? selectedIndices.filter((i) => i !== optionIndex)
            : [...selectedIndices, optionIndex].sort((a, b) => a - b);
        const selectedIds = newIndices
            .map((index) => choices[index]?.id)
            .filter((id): id is string => Boolean(id));

        setAnswer(
            item.learning_object_id,
            item.item_version_id,
            'MULTIPLE_RESPONSE',
            {
                selected_option_indices: newIndices,
                ...(selectedIds.length > 0 ? { selected_option_ids: selectedIds } : {}),
            }
        );
    };

    return (
        <div className="space-y-3">
            <p className="text-sm text-shell-muted italic mb-2">Select all that apply</p>
            {choices.map((choice, idx) => {
                const isSelected = selectedIndices.includes(idx);
                return (
                    <label
                        key={idx}
                        className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-150 ${isSelected
                                ? 'border-brand bg-brand/10 ring-1 ring-brand/50'
                                : 'border-shell-border-deep bg-shell-surface/50 hover:bg-shell-input-alt/30 hover:border-shell-border-deep'
                            }`}
                    >
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggle(idx)}
                            className="w-5 h-5 rounded text-brand bg-shell-input-alt border-shell-border-deep focus:ring-brand focus:ring-offset-0"
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

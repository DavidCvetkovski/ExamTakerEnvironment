'use client';

import { useExamStore, ExamItem } from '@/stores/useExamStore';
import { getExamChoiceContent } from '@/lib/examContent';

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
            <p className="text-sm text-gray-400 italic mb-2">Select all that apply</p>
            {choices.map((choice, idx) => {
                const isSelected = selectedIndices.includes(idx);
                return (
                    <label
                        key={idx}
                        className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-150 ${isSelected
                                ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/50'
                                : 'border-gray-700 bg-gray-900/50 hover:bg-gray-700/30 hover:border-gray-600'
                            }`}
                    >
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggle(idx)}
                            className="w-5 h-5 rounded text-indigo-600 bg-gray-700 border-gray-600 focus:ring-indigo-600 focus:ring-offset-0"
                        />
                        <span className="text-gray-200">{choice.text}</span>
                    </label>
                );
            })}
        </div>
    );
}

'use client';

import { useExamStore, ExamItem } from '@/stores/useExamStore';

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

    const choices = (item.options as { choices?: { text: string }[] })?.choices ?? [];

    const handleSelect = (optionIndex: number) => {
        setAnswer(
            item.learning_object_id,
            item.item_version_id,
            'MULTIPLE_CHOICE',
            { selected_option_index: optionIndex }
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
                                ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/50'
                                : 'border-gray-700 bg-gray-900/50 hover:bg-gray-700/30 hover:border-gray-600'
                            }`}
                    >
                        <input
                            type="radio"
                            name={`q-${questionIndex}`}
                            checked={isSelected}
                            onChange={() => handleSelect(idx)}
                            className="w-5 h-5 text-indigo-600 bg-gray-700 border-gray-600 focus:ring-indigo-600 focus:ring-offset-0"
                        />
                        <span className="text-gray-200">{choice.text}</span>
                    </label>
                );
            })}
        </div>
    );
}

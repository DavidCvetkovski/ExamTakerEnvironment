'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useExamStore, ExamItem } from '@/stores/useExamStore';

interface EssayQuestionProps {
    item: ExamItem;
    questionIndex: number;
}

const DEBOUNCE_MS = 500;

/**
 * Interactive Essay question component.
 * Renders a textarea with word count and debounced save to the exam store.
 */
export default function EssayQuestion({ item }: EssayQuestionProps) {
    const { answers, setAnswer } = useExamStore();
    const currentAnswer = answers[item.learning_object_id] as
        | { text: string }
        | undefined;

    const [localText, setLocalText] = useState(currentAnswer?.text ?? '');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync from store when answers change externally (e.g., session recovery)
    useEffect(() => {
        if (currentAnswer?.text !== undefined && currentAnswer.text !== localText) {
            setLocalText(currentAnswer.text);
        }
        // Only re-sync when currentAnswer changes, not localText
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentAnswer?.text]);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const text = e.target.value;
            setLocalText(text);

            // Debounce the store update to avoid flooding the event queue
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
            debounceRef.current = setTimeout(() => {
                setAnswer(
                    item.learning_object_id,
                    item.item_version_id,
                    'ESSAY',
                    { text }
                );
            }, DEBOUNCE_MS);
        },
        [item.learning_object_id, item.item_version_id, setAnswer]
    );

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, []);

    const wordCount = localText.trim() === '' ? 0 : localText.trim().split(/\s+/).length;
    const maxWords = (item.options as { max_words?: number })?.max_words;

    return (
        <div className="space-y-3">
            <textarea
                value={localText}
                onChange={handleChange}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder-gray-600 text-gray-200 resize-y min-h-[160px]"
                placeholder="Type your response here..."
                rows={8}
            />
            <div className="flex justify-between text-sm text-gray-400">
                <span>
                    {wordCount} word{wordCount !== 1 ? 's' : ''}
                    {maxWords ? ` / ${maxWords} max` : ''}
                </span>
                {maxWords && wordCount > maxWords && (
                    <span className="text-amber-400">
                        ⚠ Over word limit
                    </span>
                )}
            </div>
        </div>
    );
}

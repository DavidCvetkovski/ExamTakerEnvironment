'use client';

import { useAuthoringStore } from '@/stores/useAuthoringStore';
import './MCQOptionsPanel.css';

interface MCQOption {
    id: string;
    text: string;
    is_correct: boolean;
    weight: number;
}

export default function MCQOptionsPanel() {
    const { questionType, options, updateOptions, partialPoints, setPartialPoints } = useAuthoringStore();

    if (questionType !== 'MULTIPLE_CHOICE' && questionType !== 'MULTIPLE_RESPONSE') return null;

    const mcqOptions = options as MCQOption[];

    const addOption = () => {
        const nextLetter = String.fromCharCode(65 + mcqOptions.length); // A, B, C...
        updateOptions([...mcqOptions, { id: nextLetter, text: '', is_correct: false, weight: 1.0 }]);
    };

    const removeOption = (id: string) => {
        updateOptions(mcqOptions.filter((o) => o.id !== id));
    };

    const updateOption = (id: string, field: keyof MCQOption, value: string | boolean) => {
        if (questionType === 'MULTIPLE_CHOICE' && field === 'is_correct' && value === true) {
            updateOptions(
                mcqOptions.map((o) => (o.id === id ? { ...o, is_correct: true } : { ...o, is_correct: false }))
            );
        } else {
            updateOptions(
                mcqOptions.map((o) => (o.id === id ? { ...o, [field]: value } : o))
            );
        }
    };

    return (
        <div className="mcq-panel">
            <h3>Answer Options</h3>
            {mcqOptions.map((opt) => (
                <div key={opt.id} className={`mcq-option ${opt.is_correct ? 'correct' : ''}`}>
                    <span className="option-letter">{opt.id}</span>
                    <input
                        type="text"
                        placeholder={`Option ${opt.id}...`}
                        value={opt.text}
                        onChange={(e) => updateOption(opt.id, 'text', e.target.value)}
                        className="option-text"
                    />
                    <label className="correct-toggle" title="Mark as correct">
                        <input
                            type={questionType === 'MULTIPLE_CHOICE' ? 'radio' : 'checkbox'}
                            name={questionType === 'MULTIPLE_CHOICE' ? 'correct-option' : undefined}
                            checked={opt.is_correct}
                            onChange={(e) => updateOption(opt.id, 'is_correct', e.target.checked)}
                        />
                        <span className="toggle-icon">
                            {questionType === 'MULTIPLE_CHOICE'
                                ? (opt.is_correct ? '◉' : '○')
                                : (opt.is_correct ? '☑' : '☐')}
                        </span>
                    </label>
                    <button className="remove-btn" onClick={() => removeOption(opt.id)} title="Remove">
                        ✕
                    </button>
                </div>
            ))}
            <button className="add-option-btn" onClick={addOption}>
                + Add Option
            </button>
            {questionType === 'MULTIPLE_RESPONSE' && (
                <label className="flex items-center gap-3 cursor-pointer mt-3 px-1">
                    <input
                        type="checkbox"
                        checked={partialPoints}
                        onChange={(e) => setPartialPoints(e.target.checked)}
                        className="w-4 h-4 accent-brand"
                    />
                    <span className="text-meta text-foreground">Partial credit</span>
                    <span className="text-meta text-shell-muted-dim">
                        (award proportional marks per correct option selected)
                    </span>
                </label>
            )}
        </div>
    );
}

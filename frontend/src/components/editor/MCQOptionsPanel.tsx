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
    const { questionType, options, updateOptions } = useAuthoringStore();

    if (questionType !== 'MULTIPLE_CHOICE') return null;

    const mcqOptions = options as MCQOption[];

    const addOption = () => {
        const nextLetter = String.fromCharCode(65 + mcqOptions.length); // A, B, C...
        updateOptions([...mcqOptions, { id: nextLetter, text: '', is_correct: false, weight: 1.0 }]);
    };

    const removeOption = (id: string) => {
        updateOptions(mcqOptions.filter((o) => o.id !== id));
    };

    const updateOption = (id: string, field: keyof MCQOption, value: string | boolean) => {
        updateOptions(
            mcqOptions.map((o) => (o.id === id ? { ...o, [field]: value } : o))
        );
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
                            type="checkbox"
                            checked={opt.is_correct}
                            onChange={(e) => updateOption(opt.id, 'is_correct', e.target.checked)}
                        />
                        ✓
                    </label>
                    <button className="remove-btn" onClick={() => removeOption(opt.id)} title="Remove">
                        ✕
                    </button>
                </div>
            ))}
            <button className="add-option-btn" onClick={addOption}>
                + Add Option
            </button>
        </div>
    );
}

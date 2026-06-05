import { sanitizeExamHtml } from '@/lib/sanitizeHtml';

export interface AnswerChoice {
    html?: string | null;
    text?: string | null;
}

/**
 * Renders a list of MCQ answer choices with their A/B/C labels and the shared
 * selected/correct/incorrect colour matrix. One renderer for both the grading
 * review (`AutoGradeResult`) and the student results view — previously these
 * were two near-identical copies. HTML goes through the canonical
 * `sanitizeExamHtml` so it inherits the same allow-list and image-source guard.
 */
export default function AnswerChoiceList({
    options,
    selectedIndices,
    correctIndices,
}: {
    options: AnswerChoice[];
    selectedIndices: number[];
    correctIndices: number[];
}) {
    return (
        <div className="space-y-2">
            {options.map((option, idx) => {
                const isSelected = selectedIndices.includes(idx);
                const isCorrect = correctIndices.includes(idx);
                const tone =
                    isSelected && isCorrect
                        ? 'border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-fg)]'
                        : isSelected
                            ? 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)]'
                            : isCorrect
                                ? 'border-[var(--color-success-border)] bg-shell-surface text-[var(--color-success-fg)]'
                                : 'border-shell-border-deep bg-shell-surface/60 text-shell-muted';
                return (
                    <div key={`${idx}-${option.text ?? ''}`} className={`rounded-lg border px-3 py-2 text-sm ${tone}`}>
                        <span className="mr-2 font-semibold">{String.fromCharCode(65 + idx)}.</span>
                        <span
                            className="prose prose-sm inline-block max-w-none align-middle prose-p:my-0 prose-li:my-0 prose-pre:my-1"
                            dangerouslySetInnerHTML={{
                                __html: sanitizeExamHtml(option.html ?? option.text ?? `Option ${idx + 1}`),
                            }}
                        />
                    </div>
                );
            })}
        </div>
    );
}

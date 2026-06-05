import { useCallback, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { Button, CheckIcon } from '@/components/ui';
import type { ManualGradePayload, QuestionGrade } from '@/stores/useGradingStore';
import { deriveGradeState } from '@/lib/gradeState';

/**
 * The manual-grading control for one essay answer: the student's response, a
 * points input bounded by the question's max, optional feedback, and a save
 * action. Invalid input is surfaced inline rather than silently no-op'ing.
 */
export default function EssayGradingPanel({
    grade,
    onSave,
    saving,
}: {
    grade: QuestionGrade;
    onSave: (payload: ManualGradePayload) => void;
    saving: boolean;
}) {
    const [pointsInput, setPointsInput] = useState(String(grade.points_awarded));
    const [feedback, setFeedback] = useState(grade.feedback ?? '');

    const validationError = useMemo(() => {
        const pts = parseFloat(pointsInput);
        if (pointsInput.trim() === '' || isNaN(pts)) return 'Enter a number of points.';
        if (pts < 0) return 'Points cannot be negative.';
        if (pts > grade.points_possible) return `Max is ${grade.points_possible} points.`;
        return null;
    }, [pointsInput, grade.points_possible]);

    const handleSave = useCallback(() => {
        if (validationError) return;
        onSave({ points_awarded: parseFloat(pointsInput), feedback: feedback.trim() || undefined });
    }, [validationError, pointsInput, feedback, onSave]);

    // ⌘/Ctrl+Enter saves the panel whose field is focused — the unambiguous
    // "save what I'm grading" gesture (Epoch 15 #13). Plain Enter is left alone
    // so the points input and feedback textarea behave normally.
    const handleKeyDown = useCallback(
        (e: ReactKeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSave();
            }
        },
        [handleSave],
    );

    const essayText = (grade.student_answer?.essay_text as string) ?? (grade.student_answer?.text as string) ?? '';
    const isGraded = deriveGradeState(grade) === 'GRADED';

    return (
        <div className="space-y-4" onKeyDown={handleKeyDown}>
            {/* Student essay */}
            <div className="rounded-lg border border-shell-border-deep bg-shell-input/40">
                <div className="border-b border-shell-border-deep px-4 py-2">
                    <span className="text-xs font-semibold text-shell-muted">STUDENT ESSAY</span>
                </div>
                <div className="max-h-48 overflow-y-auto px-4 py-3">
                    {essayText ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{essayText}</p>
                    ) : (
                        <p className="text-sm italic text-shell-muted-dim">No answer submitted</p>
                    )}
                </div>
            </div>

            {/* Grading controls */}
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-3">
                <div>
                    <label className="mb-1 block text-xs font-semibold text-shell-muted">
                        Points (max {grade.points_possible})
                    </label>
                    <input
                        type="number"
                        min={0}
                        max={grade.points_possible}
                        step={0.5}
                        value={pointsInput}
                        onChange={(e) => setPointsInput(e.target.value)}
                        aria-invalid={validationError !== null}
                        className={`w-full rounded-lg border bg-shell-surface px-3 py-2 text-sm text-foreground focus:outline-none ${validationError ? 'border-[var(--color-danger-border)] focus:border-[var(--color-danger-border)]' : 'border-shell-border-deep focus:border-brand'}`}
                    />
                    {validationError && (
                        <p className="mt-1 text-xs text-[var(--color-danger-fg)]">{validationError}</p>
                    )}
                </div>

                <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-shell-muted">Feedback (optional)</label>
                    <textarea
                        rows={3}
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Write feedback for the student…"
                        className="w-full resize-none rounded-lg border border-shell-border-deep bg-shell-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
                    />
                </div>
            </div>

            <div className="flex items-center gap-3">
                <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSave}
                    loading={saving}
                    disabled={validationError !== null}
                    leadingIcon={<CheckIcon size={12} />}
                >
                    Save grade
                </Button>
                {isGraded && (
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--color-success-fg)]">
                        <CheckIcon size={12} /> Graded
                    </span>
                )}
            </div>
        </div>
    );
}

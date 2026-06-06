import { getExamChoiceContent } from '@/lib/examContent';
import { CheckIcon, XIcon } from '@/components/ui';
import type { QuestionGrade } from '@/stores/useGradingStore';
import AnswerChoiceList from './AnswerChoiceList';

/**
 * Read-only review of an auto-graded (MCQ / multiple-response) answer: the
 * student's selection with a correct/incorrect verdict, the correct answer, the
 * full option list, and the score.
 */
export default function AutoGradeResult({ grade }: { grade: QuestionGrade }) {
    const options = getExamChoiceContent(grade.question_options);
    const correctIndices = (grade.correct_answer as Record<string, number[]> | null)?.correct_indices ?? [];

    const studentAnswer = grade.student_answer;
    const studentIdx = studentAnswer?.selected_option_index as number | undefined;
    const studentIdxs = studentAnswer?.selected_option_indices as number[] | undefined;
    const selectedIndices = studentIdx !== undefined ? [studentIdx] : (studentIdxs ?? []);

    const selectedLabel = selectedIndices.length
        ? selectedIndices.map((i) => options[i]?.text ?? `Option ${i + 1}`).join(', ')
        : '(none)';

    return (
        <div className="space-y-3">
            {/* Student answer + verdict */}
            <div
                className={`rounded-lg border p-3 ${grade.is_correct ? 'bg-[var(--color-success-bg)] border-[var(--color-success-border)]' : 'bg-[var(--color-danger-bg)] border-[var(--color-danger-border)]'}`}
            >
                <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold text-shell-muted">STUDENT ANSWER</span>
                    {grade.is_correct !== null && (
                        <span
                            className={`inline-flex items-center gap-1 text-xs font-bold ${grade.is_correct ? 'text-[var(--color-success-fg)]' : 'text-[var(--color-danger-fg)]'}`}
                        >
                            {grade.is_correct ? <CheckIcon size={12} /> : <XIcon size={12} />}
                            {grade.is_correct ? 'CORRECT' : 'INCORRECT'}
                        </span>
                    )}
                </div>
                <p className="text-sm text-foreground">{selectedLabel}</p>
            </div>

            {options.length > 0 && (
                <div className="rounded-lg border border-shell-border-deep bg-shell-input/50 p-3">
                    <p className="mb-2 text-xs font-semibold text-shell-muted">AVAILABLE OPTIONS</p>
                    <AnswerChoiceList
                        options={options}
                        selectedIndices={selectedIndices}
                        correctIndices={correctIndices}
                    />
                </div>
            )}

            <div className="text-sm text-shell-muted">
                Score: <span className="font-semibold text-foreground">{grade.points_awarded}</span> / {grade.points_possible} pts
            </div>
        </div>
    );
}

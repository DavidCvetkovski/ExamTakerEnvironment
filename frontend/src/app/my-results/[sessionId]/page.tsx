'use client';

import DOMPurify from 'dompurify';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useResultsStore, QuestionResultDetail } from '@/stores/useResultsStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { getExamChoiceContent, toExamContentHtml, toExamContentText } from '@/lib/examContent';
import { BackButton, Spinner } from '@/components/ui';
import { formatAbsolute } from '@/lib/relativeTime';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractEssayText(answer: Record<string, unknown>): string {
    return (answer?.essay_text ?? answer?.text ?? '') as string;
}

function sanitizeHtml(html: string | null | undefined): string {
    return html
        ? DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['span', 'p', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'br', 'hr'],
            ALLOWED_ATTR: ['class'],
        })
        : '';
}

function getQuestionHeading(content: QuestionResultDetail['question_content'], index: number): string {
    const prompt = toExamContentText(content);
    if (!prompt) {
        return `Question ${index + 1}`;
    }

    return prompt.length > 96 ? `${prompt.slice(0, 93).trimEnd()}...` : prompt;
}

function MCQAnswerDisplay({ detail }: { detail: QuestionResultDetail }) {
    const options = getExamChoiceContent(detail.question_options);
    const opts = (detail.correct_answer as Record<string, number[]> | null)?.correct_indices ?? [];
    const studentIdx = detail.student_answer?.selected_option_index as number | undefined;
    const studentIdxs = detail.student_answer?.selected_option_indices as number[] | undefined;
    const allSelected = studentIdx !== undefined ? [studentIdx] : (studentIdxs ?? []);

    return (
        <div className="space-y-4 mt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-2xl border border-student-border bg-shell-surface/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-student-accent mb-2">Your Answer</p>
                    {allSelected.length > 0 ? (
                        <div className="space-y-2">
                            {allSelected.map((idx) => (
                                <div
                                    key={idx}
                                    className={`rounded-xl border px-3 py-2 text-sm ${
                                        opts.includes(idx)
                                            ? 'border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-fg)]'
                                            : 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)]'
                                    }`}
                                >
                                    <span className="mr-2 font-semibold">{String.fromCharCode(65 + idx)}.</span>
                                    <span
                                        className="inline-block align-middle prose prose-sm max-w-none prose-p:my-0 prose-li:my-0 prose-pre:my-1"
                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(options[idx]?.html ?? options[idx]?.text ?? `Option ${idx + 1}`) }}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className="text-shell-muted-dim text-sm italic">No answer submitted</span>
                    )}
                </div>

                <div className="rounded-2xl border border-[var(--color-success-border)] bg-[var(--color-success-bg)]/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-success-fg)] mb-2">Correct Answer</p>
                    {opts.length > 0 ? (
                        <div className="space-y-2">
                            {opts.map((idx) => (
                                <div key={idx} className="rounded-xl border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-3 py-2 text-sm text-[var(--color-success-fg)]">
                                    <span className="mr-2 font-semibold">{String.fromCharCode(65 + idx)}.</span>
                                    <span
                                        className="inline-block align-middle prose prose-sm max-w-none prose-p:my-0 prose-li:my-0 prose-pre:my-1"
                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(options[idx]?.html ?? options[idx]?.text ?? `Option ${idx + 1}`) }}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className="text-shell-muted-dim text-sm italic">—</span>
                    )}
                </div>
            </div>

            {options.length > 0 && (
                <div className="rounded-2xl border border-student-border bg-student-bg-alt p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-student-accent mb-3">Available Options</p>
                    <div className="space-y-2">
                        {options.map((option, idx) => {
                            const isSelected = allSelected.includes(idx);
                            const isCorrect = opts.includes(idx);
                            return (
                                <div
                                    key={`${idx}-${option.text}`}
                                    className={`rounded-xl border px-3 py-2 text-sm ${
                                        isSelected && isCorrect
                                            ? 'border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-fg)]'
                                            : isSelected
                                                ? 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)]'
                                                : isCorrect
                                                    ? 'border-[var(--color-success-border)] bg-[var(--color-success-bg)]/50 text-[var(--color-success-fg)]'
                                                    : 'border-student-border bg-shell-surface/80 text-foreground'
                                    }`}
                                >
                                    <span className="mr-2 font-semibold">{String.fromCharCode(65 + idx)}.</span>
                                    <span
                                        className="inline-block align-middle prose prose-sm max-w-none prose-p:my-0 prose-li:my-0 prose-pre:my-1"
                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(option.html) }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function QuestionCard({ detail, index }: { detail: QuestionResultDetail; index: number }) {
    const isEssay = detail.question_type === 'ESSAY';
    const isCorrect = detail.is_correct;
    const isPending = !detail.is_auto_graded && detail.is_correct === null;

    let borderColor = 'border-student-border';
    let accentColor = 'bg-shell-input-alt text-shell-muted';
    if (isPending) {
        borderColor = 'border-[var(--color-warning-border)]';
        accentColor = 'bg-[var(--color-warning-bg)] text-[var(--color-warning-fg)]';
    } else if (isCorrect === true) {
        borderColor = 'border-[var(--color-success-border)]';
        accentColor = 'bg-[var(--color-success-bg)] text-[var(--color-success-fg)]';
    } else if (isCorrect === false) {
        borderColor = 'border-[var(--color-danger-border)]';
        accentColor = 'bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)]';
    }

    return (
        <div className={`rounded-2xl border ${borderColor} bg-shell-surface/80 p-6 shadow-sm space-y-4`}>
            {/* Header row */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${accentColor}`}>
                        {isPending ? '?' : isCorrect ? '✓' : isEssay ? '#' : '✗'}
                    </div>
                    <div>
                        <p className="font-bold text-foreground text-sm">{getQuestionHeading(detail.question_content, index)}</p>
                        <p className="text-xs text-shell-muted-dim capitalize">
                            Question {index + 1} · {isEssay ? 'Open answer' : detail.question_type?.replace('_', ' ').toLowerCase()}
                        </p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-lg font-black text-foreground">
                        {detail.points_awarded}
                        <span className="text-shell-muted-dim font-normal text-sm"> / {detail.points_possible}</span>
                    </p>
                    <p className="text-xs text-shell-muted-dim">points</p>
                </div>
            </div>

            {detail.question_content != null && (
                <div
                    className="prose max-w-none rounded-2xl border border-student-border bg-student-bg-alt px-4 py-3 text-foreground"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(toExamContentHtml(detail.question_content)) }}
                />
            )}

            {/* Answer display */}
            {isEssay ? (
                <div className="space-y-3">
                    <div className="rounded-2xl border border-student-border bg-student-bg-alt p-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-student-accent mb-2">Your Essay</p>
                        {extractEssayText(detail.student_answer) ? (
                            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                                {extractEssayText(detail.student_answer)}
                            </p>
                        ) : (
                            <p className="text-sm text-shell-muted-dim italic">No answer submitted</p>
                        )}
                    </div>
                    {isPending && (
                        <div className="flex items-center gap-2 text-[var(--color-warning-fg)] text-xs">
                            <span>⏳</span>
                            <span>Awaiting manual grading</span>
                        </div>
                    )}
                </div>
            ) : (
                <MCQAnswerDisplay detail={detail} />
            )}

            {/* Feedback */}
            {detail.feedback && (
                <div className="rounded-2xl border border-student-primary/20 bg-student-hover-light p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-student-primary mb-1">Grader Feedback</p>
                    <p className="text-sm text-foreground leading-relaxed">{detail.feedback}</p>
                </div>
            )}
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyResultDetailPage() {
    const { sessionId } = useParams<{ sessionId: string }>();
    const router = useRouter();
    const { user } = useAuthStore();
    const { currentResultDetail, detailLoading, error, fetchMyResultDetail } = useResultsStore();

    useEffect(() => {
        if (sessionId) fetchMyResultDetail(sessionId);
    }, [sessionId, fetchMyResultDetail]);

    // Redirect non-students
    if (user && user.role !== 'STUDENT') {
        router.replace('/grading');
        return null;
    }

    const result = currentResultDetail;

    return (
        <div className="min-h-full bg-[image:var(--gradient-student-page)] px-4 py-10 text-foreground sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl space-y-8">
                {/* Back */}
                <BackButton href="/my-exams" label="Back to my exams" className="mb-0" />

                {/* Error */}
                {error && (
                    <div className="rounded-2xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-5 py-4 text-sm text-[var(--color-danger-fg)]">
                        {error}
                    </div>
                )}

                {/* Loading */}
                {detailLoading && (
                    <div className="flex items-center justify-center py-20 text-shell-muted-dim text-sm gap-3">
                        <Spinner size="md" />
                        Loading your result…
                    </div>
                )}

                {result && !detailLoading && (
                    <>
                        {/* Result header card */}
                        <div className="rounded-2xl border border-student-border bg-[image:var(--gradient-student-hero)] p-8 shadow-warm-hero-md">
                            <p className="text-xs font-semibold uppercase tracking-wider text-student-accent">Exam Result</p>
                            <h1 className="mt-2 text-4xl font-black tracking-tight text-foreground">
                                {result.test_title}
                            </h1>
                            {result.submitted_at && (
                                <p className="mt-2 text-sm text-shell-muted-dim">
                                    Submitted on {formatAbsolute(result.submitted_at)}
                                </p>
                            )}

                            {/* Score summary */}
                            <div className="mt-6 grid grid-cols-3 gap-4">
                                <div className="rounded-2xl border border-student-border bg-shell-surface/60 p-4 text-center">
                                    <p className="text-3xl font-black text-foreground">{result.percentage.toFixed(1)}%</p>
                                    <p className="text-xs text-shell-muted-dim mt-1">Score</p>
                                </div>
                                <div className="rounded-2xl border border-student-border bg-shell-surface/60 p-4 text-center">
                                    <p className="text-3xl font-black text-foreground">{result.total_points}</p>
                                    <p className="text-xs text-shell-muted-dim mt-1">Points (of {result.max_points})</p>
                                </div>
                                <div className="rounded-2xl border border-student-border bg-shell-surface/60 p-4 text-center">
                                    {result.letter_grade ? (
                                        <>
                                            <p className={`text-3xl font-black ${result.passed ? 'text-[var(--color-success-fg)]' : 'text-[var(--color-danger-fg)]'}`}>
                                                {result.letter_grade}
                                            </p>
                                            <p className="text-xs text-shell-muted-dim mt-1">Grade</p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-2xl font-black text-[var(--color-warning-fg)]">⏳</p>
                                            <p className="text-xs text-shell-muted-dim mt-1">Pending</p>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Pass/fail badge */}
                            {result.passed !== null && (
                                <div className="mt-4">
                                    <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold ${
                                        result.passed
                                            ? 'bg-[var(--color-success-bg)] text-[var(--color-success-fg)] border border-[var(--color-success-border)]'
                                            : 'bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] border border-[var(--color-danger-border)]'
                                    }`}>
                                        {result.passed ? '✓ Passed' : '✗ Did not pass'}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Per-question breakdown */}
                        {result.question_results.length > 0 && (
                            <div className="space-y-4">
                                <h2 className="text-2xl font-black text-foreground">Question Breakdown</h2>
                                {result.question_results.map((detail, idx) => (
                                    <QuestionCard key={detail.grade_id} detail={detail} index={idx} />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

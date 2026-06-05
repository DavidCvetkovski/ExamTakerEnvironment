'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';

import { useResultsStore, QuestionResultDetail } from '@/stores/useResultsStore';
import { getExamChoiceContent, toExamContentHtml } from '@/lib/examContent';
import { sanitizeExamHtml } from '@/lib/sanitizeHtml';
import { BackButton, Spinner, StatCard, CheckIcon, XIcon, AlertIcon } from '@/components/ui';
import PageShell from '@/components/layout/PageShell';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import AnswerChoiceList from '@/components/grading/AnswerChoiceList';
import { formatAbsolute } from '@/lib/relativeTime';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractEssayText(answer: Record<string, unknown>): string {
    return (answer?.essay_text ?? answer?.text ?? '') as string;
}

function MCQAnswerDisplay({ detail }: { detail: QuestionResultDetail }) {
    const options = getExamChoiceContent(detail.question_options);
    const correctIndices = (detail.correct_answer as Record<string, number[]> | null)?.correct_indices ?? [];
    const studentIdx = detail.student_answer?.selected_option_index as number | undefined;
    const studentIdxs = detail.student_answer?.selected_option_indices as number[] | undefined;
    const selectedIndices = studentIdx !== undefined ? [studentIdx] : (studentIdxs ?? []);

    return (
        <div className="mt-3 space-y-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-shell-border bg-shell-surface/60 p-4">
                    <p className="mb-2 text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim">Your answer</p>
                    {selectedIndices.length > 0 ? (
                        <div className="space-y-2">
                            {selectedIndices.map((idx) => {
                                const correct = correctIndices.includes(idx);
                                return (
                                    <div
                                        key={idx}
                                        className={`rounded-lg border px-3 py-2 text-sm ${correct ? 'border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-fg)]' : 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)]'}`}
                                    >
                                        <span className="mr-2 font-semibold">{String.fromCharCode(65 + idx)}.</span>
                                        <span
                                            className="prose prose-sm inline-block max-w-none align-middle prose-p:my-0 prose-li:my-0 prose-pre:my-1"
                                            dangerouslySetInnerHTML={{ __html: sanitizeExamHtml(options[idx]?.html ?? options[idx]?.text ?? `Option ${idx + 1}`) }}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <span className="text-meta italic text-shell-muted-dim">No answer submitted</span>
                    )}
                </div>

                <div className="rounded-xl border border-[var(--color-success-border)] bg-[var(--color-success-bg)]/50 p-4">
                    <p className="mb-2 text-eyebrow font-semibold uppercase tracking-eyebrow text-[var(--color-success-fg)]">Correct answer</p>
                    {correctIndices.length > 0 ? (
                        <div className="space-y-2">
                            {correctIndices.map((idx) => (
                                <div key={idx} className="rounded-lg border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-3 py-2 text-sm text-[var(--color-success-fg)]">
                                    <span className="mr-2 font-semibold">{String.fromCharCode(65 + idx)}.</span>
                                    <span
                                        className="prose prose-sm inline-block max-w-none align-middle prose-p:my-0 prose-li:my-0 prose-pre:my-1"
                                        dangerouslySetInnerHTML={{ __html: sanitizeExamHtml(options[idx]?.html ?? options[idx]?.text ?? `Option ${idx + 1}`) }}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className="text-meta italic text-shell-muted-dim">—</span>
                    )}
                </div>
            </div>

            {options.length > 0 && (
                <div className="rounded-xl border border-shell-border bg-shell-input-alt p-4">
                    <p className="mb-3 text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim">Available options</p>
                    <AnswerChoiceList options={options} selectedIndices={selectedIndices} correctIndices={correctIndices} />
                </div>
            )}
        </div>
    );
}

function StatusIcon({ detail }: { detail: QuestionResultDetail }) {
    const isPending = !detail.is_auto_graded && detail.is_correct === null;
    if (isPending) return <AlertIcon size={16} />;
    if (detail.is_correct) return <CheckIcon size={16} />;
    return <XIcon size={16} />;
}

function QuestionCard({ detail, index }: { detail: QuestionResultDetail; index: number }) {
    const isEssay = detail.question_type === 'ESSAY';
    const isPending = !detail.is_auto_graded && detail.is_correct === null;

    let borderColor = 'border-shell-border';
    let accentColor = 'bg-shell-input-alt text-shell-muted';
    if (isPending) {
        borderColor = 'border-[var(--color-warning-border)]';
        accentColor = 'bg-[var(--color-warning-bg)] text-[var(--color-warning-fg)]';
    } else if (detail.is_correct === true) {
        borderColor = 'border-[var(--color-success-border)]';
        accentColor = 'bg-[var(--color-success-bg)] text-[var(--color-success-fg)]';
    } else if (detail.is_correct === false) {
        borderColor = 'border-[var(--color-danger-border)]';
        accentColor = 'bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)]';
    }

    return (
        <div className={`space-y-4 rounded-xl border ${borderColor} bg-shell-surface/80 p-6`}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${accentColor}`}>
                        <StatusIcon detail={detail} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-foreground">Question {index + 1}</p>
                        <p className="text-meta capitalize text-shell-muted-dim">
                            {isEssay ? 'Open answer' : detail.question_type?.replace('_', ' ').toLowerCase()}
                        </p>
                    </div>
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-h3 text-foreground">
                        {detail.points_awarded}
                        <span className="text-meta font-normal text-shell-muted-dim"> / {detail.points_possible}</span>
                    </p>
                    <p className="text-meta text-shell-muted-dim">points</p>
                </div>
            </div>

            {detail.question_content != null && (
                <div
                    className="prose max-w-none rounded-lg border border-shell-border bg-shell-input-alt px-4 py-3 text-foreground"
                    dangerouslySetInnerHTML={{ __html: sanitizeExamHtml(toExamContentHtml(detail.question_content)) }}
                />
            )}

            {isEssay ? (
                <div className="space-y-3">
                    <div className="rounded-xl border border-shell-border bg-shell-input-alt p-4">
                        <p className="mb-2 text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim">Your essay</p>
                        {extractEssayText(detail.student_answer) ? (
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                                {extractEssayText(detail.student_answer)}
                            </p>
                        ) : (
                            <p className="text-sm italic text-shell-muted-dim">No answer submitted</p>
                        )}
                    </div>
                    {isPending && (
                        <div className="flex items-center gap-2 text-meta text-[var(--color-warning-fg)]">
                            <Spinner size="sm" />
                            <span>Awaiting manual grading</span>
                        </div>
                    )}
                </div>
            ) : (
                <MCQAnswerDisplay detail={detail} />
            )}

            {detail.feedback && (
                <div className="rounded-xl border border-brand/30 bg-brand/10 p-4">
                    <p className="mb-1 text-eyebrow font-semibold uppercase tracking-eyebrow text-brand">Grader feedback</p>
                    <p className="text-sm leading-relaxed text-foreground">{detail.feedback}</p>
                </div>
            )}
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyResultDetailPage() {
    const { sessionId } = useParams<{ sessionId: string }>();
    const { currentResultDetail: result, detailLoading, error, fetchMyResultDetail } = useResultsStore();

    useEffect(() => {
        if (sessionId) fetchMyResultDetail(sessionId);
    }, [sessionId, fetchMyResultDetail]);

    return (
        <ProtectedRoute allowedRoles={['STUDENT']}>
            <PageShell width="standard">
                <BackButton href="/my-grades" label="Back to my grades" />

                {error && (
                    <div className="rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-5 py-4 text-sm text-[var(--color-danger-fg)]">
                        {error}
                    </div>
                )}

                {detailLoading && (
                    <div className="flex items-center justify-center gap-3 py-20 text-sm text-shell-muted-dim">
                        <Spinner size="md" />
                        Loading your result…
                    </div>
                )}

                {result && !detailLoading && (
                    <div className="space-y-8">
                        {/* Result header */}
                        <div className="rounded-xl border border-shell-border bg-shell-surface p-8">
                            <p className="text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim">Exam result</p>
                            <h1 className="mt-2 text-display text-foreground">{result.test_title}</h1>
                            {result.submitted_at && (
                                <p className="mt-2 text-meta text-shell-muted-dim">
                                    Submitted on {formatAbsolute(result.submitted_at)}
                                </p>
                            )}

                            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <StatCard label="Score" value={`${result.percentage.toFixed(1)}%`} tone="info" />
                                <StatCard label={`Points (of ${result.max_points})`} value={result.total_points} />
                                <StatCard
                                    label={result.letter_grade ? 'Grade' : 'Pending'}
                                    value={result.letter_grade ?? '—'}
                                    tone={result.passed === false ? 'warning' : result.passed ? 'success' : 'neutral'}
                                />
                            </div>

                            {result.passed !== null && (
                                <div className="mt-4">
                                    <span
                                        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold ${result.passed ? 'border border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-fg)]' : 'border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)]'}`}
                                    >
                                        {result.passed ? <CheckIcon size={14} /> : <XIcon size={14} />}
                                        {result.passed ? 'Passed' : 'Did not pass'}
                                    </span>
                                </div>
                            )}
                        </div>

                        {result.question_results.length > 0 && (
                            <div className="space-y-4">
                                <h2 className="text-h2 text-foreground">Question breakdown</h2>
                                {result.question_results.map((detail, idx) => (
                                    <QuestionCard key={detail.grade_id} detail={detail} index={idx} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </PageShell>
        </ProtectedRoute>
    );
}

'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { useGradingStore, QuestionGrade } from '@/stores/useGradingStore';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { toExamContentHtml, toExamContentText } from '@/lib/examContent';
import { sanitizeExamHtml } from '@/lib/sanitizeHtml';
import { formatStudentLabel } from '@/lib/studentLabel';
import { deriveGradeState, isAwaitingGrade } from '@/lib/gradeState';
import { BackButton, Button, Spinner, StatCard, CheckIcon, XIcon, AlertIcon } from '@/components/ui';
import AutoGradeResult from '@/components/grading/AutoGradeResult';
import EssayGradingPanel from '@/components/grading/EssayGradingPanel';

function getQuestionHeading(content: QuestionGrade['question_content'], index: number): string {
    const prompt = toExamContentText(content);
    if (!prompt) return `Question ${index + 1}`;
    return prompt.length > 96 ? `${prompt.slice(0, 93).trimEnd()}…` : prompt;
}

export default function SessionGradingPage() {
    const { sessionId } = useParams<{ sessionId: string }>();
    const router = useRouter();
    const searchParams = useSearchParams();

    const fromTest = searchParams.get('fromTest');
    const fromRun = searchParams.get('fromRun');
    const sessionIdsStr = searchParams.get('sessionIds');
    const backHref = fromTest && fromRun ? `/grading/test/${fromTest}/run/${fromRun}` : '/grading';
    const backLabel = fromTest && fromRun ? 'Back to submissions' : 'Back to dashboard';

    const sessionIds = useMemo(() => (sessionIdsStr ? sessionIdsStr.split(',') : []), [sessionIdsStr]);
    const currentIndex = useMemo(() => sessionIds.indexOf(sessionId), [sessionIds, sessionId]);
    const prevSessionId = currentIndex > 0 ? sessionIds[currentIndex - 1] : null;
    const nextSessionId =
        currentIndex !== -1 && currentIndex < sessionIds.length - 1 ? sessionIds[currentIndex + 1] : null;

    const {
        questionGrades, sessionResult, gradesLoading,
        submittingGradeId, blindMode, error,
        fetchSessionGrades, submitManualGrade, clearError,
    } = useGradingStore();

    useEffect(() => {
        if (sessionId) fetchSessionGrades(sessionId);
    }, [sessionId, fetchSessionGrades]);

    // Preserve only the params that are actually present, so prev/next never
    // builds `?fromTest=null&fromRun=null` URLs.
    const navQuery = useMemo(() => {
        const params = new URLSearchParams();
        if (fromTest) params.set('fromTest', fromTest);
        if (fromRun) params.set('fromRun', fromRun);
        if (sessionIdsStr) params.set('sessionIds', sessionIdsStr);
        const q = params.toString();
        return q ? `?${q}` : '';
    }, [fromTest, fromRun, sessionIdsStr]);

    const gotoSession = (id: string) => router.push(`/grading/${id}${navQuery}`);

    const pendingEssays = questionGrades.filter(isAwaitingGrade);
    const studentLabel = sessionResult?.student_email ? formatStudentLabel(sessionResult.student_email) : null;
    const positionLabel =
        currentIndex >= 0 && sessionIds.length > 1 ? `Submission ${currentIndex + 1} of ${sessionIds.length}` : null;
    const showPager = Boolean(prevSessionId || nextSessionId || positionLabel);

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-full bg-shell-bg text-foreground">
                {/* Sticky header: back · who+what · a clean N-of-M pager. Score
                    summary lives in the body, not crammed in here. */}
                <div className="sticky top-0 z-30 border-b border-shell-border bg-shell-surface px-6 py-3">
                    <div className="mx-auto flex max-w-5xl items-center gap-4">
                        <BackButton href={backHref} label={backLabel} className="mb-0" />

                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold uppercase tracking-medium text-shell-muted-dim">
                                {blindMode ? 'Blind review' : 'Grading review'}
                            </p>
                            <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                                {blindMode || !studentLabel ? (
                                    sessionResult?.test_title ?? 'Submitted exam response'
                                ) : (
                                    <>
                                        {studentLabel}
                                        <span className="font-normal text-shell-muted-dim"> · {sessionResult?.test_title}</span>
                                    </>
                                )}
                            </p>
                        </div>

                        {showPager && (
                            <div className="flex shrink-0 items-center gap-2">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={!prevSessionId}
                                    onClick={() => prevSessionId && gotoSession(prevSessionId)}
                                    aria-label="Previous submission"
                                >
                                    ←
                                </Button>
                                {positionLabel && (
                                    <span className="whitespace-nowrap text-xs tabular-nums text-shell-muted">
                                        {positionLabel}
                                    </span>
                                )}
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={!nextSessionId}
                                    onClick={() => nextSessionId && gotoSession(nextSessionId)}
                                    aria-label="Next submission"
                                >
                                    →
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
                    {error && (
                        <div className="flex justify-between rounded-lg border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-sm text-[var(--color-danger-fg)]">
                            <span>{error}</span>
                            <button onClick={clearError} aria-label="Dismiss" className="text-[var(--color-danger-fg)] hover:opacity-80">
                                <XIcon size={14} />
                            </button>
                        </div>
                    )}

                    {/* Score summary — demoted out of the sticky header. */}
                    {sessionResult && (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <StatCard
                                label="Graded"
                                value={`${sessionResult.questions_graded} / ${sessionResult.questions_total}`}
                            />
                            <StatCard
                                label="Points"
                                value={`${sessionResult.total_points} / ${sessionResult.max_points}`}
                            />
                            <StatCard label="Score" value={`${sessionResult.percentage.toFixed(1)}%`} tone="info" />
                            <StatCard
                                label="Grade"
                                value={sessionResult.letter_grade ?? '—'}
                                tone={sessionResult.passed === false ? 'warning' : 'success'}
                            />
                        </div>
                    )}

                    {pendingEssays.length > 0 && (
                        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-4 py-2 text-sm text-[var(--color-warning-fg)]">
                            <AlertIcon size={14} />
                            {pendingEssays.length} essay{pendingEssays.length > 1 ? 's' : ''} pending manual grading
                        </div>
                    )}

                    {gradesLoading && (
                        <div className="flex items-center justify-center py-20 text-shell-muted-dim">
                            <Spinner size="lg" className="mr-3" />
                            Loading grades…
                        </div>
                    )}

                    {!gradesLoading && questionGrades.map((grade, idx) => {
                        const resolved = deriveGradeState(grade) !== 'PENDING';
                        const isEssay = !grade.is_auto_graded;
                        return (
                            <div
                                key={grade.id}
                                className={`space-y-5 rounded-xl border bg-shell-surface p-6 transition-colors ${resolved ? 'border-[var(--color-success-border)]' : 'border-[var(--color-warning-border)]'}`}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <span
                                            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${resolved ? 'bg-[var(--color-success-bg)] text-[var(--color-success-fg)]' : 'bg-[var(--color-warning-bg)] text-[var(--color-warning-fg)]'}`}
                                        >
                                            {resolved ? <CheckIcon size={14} /> : idx + 1}
                                        </span>
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">
                                                {getQuestionHeading(grade.question_content, idx)}
                                            </p>
                                            <p className="text-xs text-shell-muted-dim">
                                                Question {idx + 1} · {isEssay ? 'Essay — manual grading' : 'Auto-graded'}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-right font-bold text-foreground">
                                        {grade.points_awarded}{' '}
                                        <span className="font-normal text-shell-muted-dim">/ {grade.points_possible} pts</span>
                                    </p>
                                </div>

                                {grade.question_content != null && (
                                    <div
                                        className="prose max-w-none rounded-lg border border-shell-border bg-shell-bg/60 px-4 py-3 text-base leading-relaxed"
                                        dangerouslySetInnerHTML={{ __html: sanitizeExamHtml(toExamContentHtml(grade.question_content)) }}
                                    />
                                )}

                                {isEssay ? (
                                    <EssayGradingPanel
                                        key={`${grade.id}-${grade.points_awarded}-${grade.feedback ?? ''}`}
                                        grade={grade}
                                        onSave={(payload) => submitManualGrade(grade.id, payload)}
                                        saving={submittingGradeId === grade.id}
                                    />
                                ) : (
                                    <AutoGradeResult grade={grade} />
                                )}
                            </div>
                        );
                    })}

                    {!gradesLoading && questionGrades.length === 0 && (
                        <div className="py-20 text-center text-shell-muted-dim">
                            No grades found for this session. This session may not have been submitted yet.
                        </div>
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
}

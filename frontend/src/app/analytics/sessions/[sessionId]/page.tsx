'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Badge, BackButton, PageHeader, Spinner, StatCard, Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui';
import PageShell from '@/components/layout/PageShell';
import { api } from '@/lib/api';
import { formatAbsolute } from '@/lib/relativeTime';

interface SessionResult {
    id: string;
    session_id: string;
    test_definition_id: string;
    test_title?: string | null;
    student_id: string;
    total_points: number;
    max_points: number;
    percentage: number;
    grading_status: string;
    questions_graded: number;
    questions_total: number;
    letter_grade: string | null;
    is_published: boolean;
    submitted_at?: string | null;
}

interface QuestionGrade {
    grade_id?: string;
    id?: string;
    learning_object_id: string;
    question_type: string | null;
    points_awarded: number;
    points_possible: number;
    is_correct: boolean | null;
    is_auto_graded: boolean;
    feedback: string | null;
}

function gradeTone(g: QuestionGrade): 'success' | 'danger' | 'neutral' | 'warning' {
    if (g.is_correct === true) return 'success';
    if (g.is_correct === false) return 'danger';
    if (!g.is_auto_graded && g.feedback === null) return 'warning';
    return 'neutral';
}

function gradeLabel(g: QuestionGrade): string {
    if (!g.is_auto_graded && g.feedback === null) return 'Pending';
    if (g.is_correct === true) return 'Correct';
    if (g.is_correct === false) return 'Incorrect';
    return 'Partial';
}

export default function AnalyticsSessionDetailPage() {
    const { sessionId } = useParams<{ sessionId: string }>();
    const [result, setResult] = useState<SessionResult | null>(null);
    const [grades, setGrades] = useState<QuestionGrade[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!sessionId) return;
        Promise.all([
            api.get<SessionResult>(`grading/sessions/${sessionId}/result`),
            api.get<QuestionGrade[]>(`grading/sessions/${sessionId}/grades`),
        ])
            .then(([resultRes, gradesRes]) => {
                setResult(resultRes.data);
                setGrades(gradesRes.data ?? []);
            })
            .catch(() => setError('Failed to load session data.'))
            .finally(() => setIsLoading(false));
    }, [sessionId]);

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <PageShell width="standard">
                <BackButton href="/analytics" label="Analytics" />

                {isLoading ? (
                    <div className="flex items-center justify-center py-24 gap-3 text-shell-muted-dim text-meta">
                        <Spinner size="sm" /> Loading session…
                    </div>
                ) : error ? (
                    <div className="rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] px-4 py-3 text-meta">
                        {error}
                    </div>
                ) : result ? (
                    <div className="space-y-8">
                        <PageHeader
                            title={result.test_title ?? 'Session result'}
                            subtitle={result.submitted_at ? `Submitted ${formatAbsolute(result.submitted_at)}` : undefined}
                        />

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <StatCard label="Score" value={`${result.percentage.toFixed(1)}%`} tone={result.percentage >= 55 ? 'success' : 'danger'} />
                            <StatCard label="Points" value={`${result.total_points} / ${result.max_points}`} />
                            <StatCard label="Questions graded" value={`${result.questions_graded} / ${result.questions_total}`} />
                            <StatCard
                                label="Status"
                                value={result.grading_status === 'FULLY_GRADED' || result.grading_status === 'AUTO_GRADED' ? 'Complete' : result.grading_status === 'PARTIALLY_GRADED' ? 'In progress' : 'Not started'}
                                tone={result.grading_status === 'FULLY_GRADED' || result.grading_status === 'AUTO_GRADED' ? 'success' : 'warning'}
                            />
                        </div>

                        {grades.length > 0 && (
                            <TableContainer>
                                <Table>
                                    <THead>
                                        <TR>
                                            <TH>#</TH>
                                            <TH>Type</TH>
                                            <TH>Result</TH>
                                            <TH align="right">Points</TH>
                                            <TH>Feedback</TH>
                                        </TR>
                                    </THead>
                                    <TBody>
                                        {grades.map((g, idx) => (
                                            <TR key={g.grade_id ?? g.id ?? idx}>
                                                <TD>{idx + 1}</TD>
                                                <TD>
                                                    <span className="text-meta text-shell-muted-dim">
                                                        {g.question_type?.replace('_', ' ').toLowerCase() ?? '—'}
                                                    </span>
                                                </TD>
                                                <TD>
                                                    <Badge tone={gradeTone(g)} size="sm">{gradeLabel(g)}</Badge>
                                                </TD>
                                                <TD align="right" numeric>
                                                    <span className="tabular-nums">{g.points_awarded} / {g.points_possible}</span>
                                                </TD>
                                                <TD>
                                                    <span className="text-meta text-shell-muted-dim">
                                                        {g.feedback ?? (g.is_auto_graded ? 'Auto-graded' : '—')}
                                                    </span>
                                                </TD>
                                            </TR>
                                        ))}
                                    </TBody>
                                </Table>
                            </TableContainer>
                        )}
                    </div>
                ) : null}
            </PageShell>
        </ProtectedRoute>
    );
}

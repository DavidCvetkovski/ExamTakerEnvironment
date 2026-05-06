'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import StudentExamCard from '@/components/student/StudentExamCard';
import { useExamStore } from '@/stores/useExamStore';
import { useStudentSessionsStore } from '@/stores/useStudentSessionsStore';
import { useResultsStore } from '@/stores/useResultsStore';
import { Badge, Card, EmptyState, PageHeader, SectionHeader } from '@/components/ui';

export default function MyExamsPage() {
    const router = useRouter();
    const { sessions, isLoading, error, fetchSessions } = useStudentSessionsStore();
    const joinScheduledSession = useExamStore((state) => state.joinScheduledSession);
    const { myResults, myResultsLoading, fetchMyResults } = useResultsStore();

    useEffect(() => {
        fetchSessions();
        fetchMyResults();
    }, [fetchSessions, fetchMyResults]);

    const currentSessions = sessions.filter((s) => s.can_join);
    const upcomingSessions = sessions.filter((s) => !s.can_join);

    return (
        <ProtectedRoute allowedRoles={['STUDENT']}>
            <div className="min-h-screen bg-shell-bg text-foreground">
                <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <PageHeader
                        eyebrow="Student portal"
                        title="My Exams"
                        subtitle="Join live sessions, track upcoming windows, and review your results."
                    />

                    {error && (
                        <div className="mb-6 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] px-4 py-3 text-meta">
                            {error}
                        </div>
                    )}

                    <section className="space-y-4 mb-10">
                        <SectionHeader
                            eyebrow="Current"
                            title="Joinable right now"
                            actions={isLoading ? <span className="text-meta text-shell-muted-dim">Refreshing…</span> : undefined}
                        />
                        <div className="grid gap-5 lg:grid-cols-2">
                            {currentSessions.length === 0 ? (
                                <EmptyState
                                    title="Nothing live"
                                    description="No current exam sessions are open for you right now."
                                    variant="compact"
                                    className="lg:col-span-2"
                                />
                            ) : (
                                currentSessions.map((session) => (
                                    <StudentExamCard
                                        key={session.id}
                                        session={session}
                                        onJoin={async (selected) => {
                                            const attemptId = await joinScheduledSession(selected.id);
                                            router.push(`/exam/${attemptId}`);
                                        }}
                                    />
                                ))
                            )}
                        </div>
                    </section>

                    <section className="space-y-4 mb-10">
                        <SectionHeader eyebrow="Upcoming" title="Scheduled later" />
                        <div className="grid gap-5 lg:grid-cols-2">
                            {upcomingSessions.length === 0 ? (
                                <EmptyState
                                    title="Nothing scheduled"
                                    description="No future exam sessions are scheduled for you."
                                    variant="compact"
                                    className="lg:col-span-2"
                                />
                            ) : (
                                upcomingSessions.map((session) => (
                                    <StudentExamCard
                                        key={session.id}
                                        session={session}
                                        onJoin={async () => Promise.resolve()}
                                    />
                                ))
                            )}
                        </div>
                    </section>

                    {(myResults.length > 0 || myResultsLoading) && (
                        <section className="space-y-4">
                            <SectionHeader eyebrow="Results" title="My grades" />
                            {myResultsLoading ? (
                                <div className="text-meta text-shell-muted-dim">Loading results…</div>
                            ) : (
                                <div className="grid gap-4 lg:grid-cols-2">
                                    {myResults.map((result) => (
                                        <Link key={result.session_id} href={`/my-results/${result.session_id}`} className="block">
                                            <Card variant="surface" padding="md" interactive>
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-foreground text-h3">
                                                            {result.test_title ?? 'Exam result'}
                                                        </p>
                                                        {result.submitted_at && (
                                                            <p className="text-meta text-shell-muted-dim mt-0.5">
                                                                Submitted {new Date(result.submitted_at).toLocaleDateString()}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-h1 text-foreground tabular-nums">
                                                            {result.percentage.toFixed(1)}%
                                                        </p>
                                                        <p className="text-meta text-shell-muted-dim tabular-nums">
                                                            {result.total_points} / {result.max_points} pts
                                                        </p>
                                                    </div>
                                                </div>
                                                {result.letter_grade && (
                                                    <div className="mt-3 flex items-center gap-2">
                                                        <Badge tone={result.passed ? 'success' : 'danger'} size="sm">
                                                            {result.letter_grade}
                                                        </Badge>
                                                        <span className="text-meta font-medium text-brand">View details →</span>
                                                    </div>
                                                )}
                                            </Card>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
}

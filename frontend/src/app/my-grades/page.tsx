'use client';

import { useEffect } from 'react';
import Link from 'next/link';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useResultsStore } from '@/stores/useResultsStore';
import { Badge, Card, EmptyState, PageHeader, SectionHeader } from '@/components/ui';

export default function MyGradesPage() {
    const { myResults, myResultsLoading, fetchMyResults } = useResultsStore();

    useEffect(() => {
        fetchMyResults({ includeUnpublished: true });
    }, [fetchMyResults]);

    const published = myResults.filter((r) => r.is_published);
    const pending = myResults.filter((r) => !r.is_published);

    return (
        <ProtectedRoute allowedRoles={['STUDENT']}>
            <div className="min-h-screen bg-shell-bg text-foreground">
                <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <PageHeader
                        eyebrow="Student portal"
                        title="My Grades"
                        subtitle="Review your published exam results and track sessions still being graded."
                    />

                    {myResultsLoading && myResults.length === 0 ? (
                        <div className="flex items-center justify-center py-20 text-shell-muted-dim text-meta gap-3">
                            <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                            Loading your results…
                        </div>
                    ) : myResults.length === 0 ? (
                        <EmptyState
                            title="No grades yet"
                            description="Once you submit an exam, the result will appear here."
                        />
                    ) : (
                        <div className="space-y-10">
                            {pending.length > 0 ? (
                                <section className="space-y-4">
                                    <SectionHeader
                                        eyebrow="Awaiting"
                                        title="Submitted, not yet published"
                                    />
                                    <div className="grid gap-4 lg:grid-cols-2">
                                        {pending.map((result) => (
                                            <Card key={result.session_id} variant="surface" padding="md">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-foreground text-h3">
                                                            {result.test_title ?? 'Exam result'}
                                                        </p>
                                                        {result.submitted_at ? (
                                                            <p className="text-meta text-shell-muted-dim mt-0.5">
                                                                Submitted {new Date(result.submitted_at).toLocaleDateString()}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    <Badge tone={pendingTone(result.grading_status)} size="sm">
                                                        {pendingLabel(result.grading_status)}
                                                    </Badge>
                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                </section>
                            ) : null}

                            {published.length > 0 ? (
                                <section className="space-y-4">
                                    <SectionHeader
                                        eyebrow="Published"
                                        title="Released results"
                                    />
                                    <div className="grid gap-4 lg:grid-cols-2">
                                        {published.map((result) => (
                                            <Link key={result.session_id} href={`/my-results/${result.session_id}`} className="block">
                                                <Card variant="surface" padding="md" interactive>
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-foreground text-h3">
                                                                {result.test_title ?? 'Exam result'}
                                                            </p>
                                                            {result.submitted_at ? (
                                                                <p className="text-meta text-shell-muted-dim mt-0.5">
                                                                    Submitted {new Date(result.submitted_at).toLocaleDateString()}
                                                                </p>
                                                            ) : null}
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
                                                    {result.letter_grade ? (
                                                        <div className="mt-3 flex items-center gap-2">
                                                            <Badge tone={result.passed ? 'success' : 'danger'} size="sm">
                                                                {result.letter_grade}
                                                            </Badge>
                                                            <span className="text-meta font-medium text-brand">View details →</span>
                                                        </div>
                                                    ) : null}
                                                </Card>
                                            </Link>
                                        ))}
                                    </div>
                                </section>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
}

function pendingLabel(status: string): string {
    if (status === 'PARTIALLY_GRADED') return 'Partially graded';
    if (status === 'FULLY_GRADED' || status === 'AUTO_GRADED') return 'Awaiting publication';
    return 'Awaiting grading';
}

function pendingTone(status: string): 'neutral' | 'info' | 'warning' {
    if (status === 'FULLY_GRADED' || status === 'AUTO_GRADED') return 'info';
    if (status === 'PARTIALLY_GRADED') return 'warning';
    return 'neutral';
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useResultsStore } from '@/stores/useResultsStore';
import { Badge, Button, Card, EmptyState, PageHeader, SectionHeader, Spinner } from '@/components/ui';
import { formatRelativeTime } from '@/lib/relativeTime';

export default function MyGradesPage() {
    const router = useRouter();
    const { myResults, myResultsLoading, fetchMyResults } = useResultsStore();

    useEffect(() => {
        fetchMyResults({ includeUnpublished: true });
    }, [fetchMyResults]);

    const published = myResults.filter((r) => r.is_published);
    const pending = myResults.filter((r) => !r.is_published);

    return (
        <ProtectedRoute allowedRoles={['STUDENT']}>
            <div className="min-h-full bg-shell-bg text-foreground">
                <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <PageHeader
                        eyebrow="Student portal"
                        title="My Grades"
                        subtitle="Review your published exam results and track sessions still being graded."
                    />

                    {myResultsLoading && myResults.length === 0 ? (
                        <div className="flex items-center justify-center py-20 text-shell-muted-dim text-meta gap-3">
                            <Spinner size="md" />
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
                                                                Submitted {formatRelativeTime(result.submitted_at)}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                    <Badge tone="neutral" size="sm">
                                                        Not yet published
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
                                                <Card key={result.session_id} variant="surface" padding="md">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-foreground text-h3">
                                                                {result.test_title ?? 'Exam result'}
                                                            </p>
                                                            {result.submitted_at ? (
                                                                <p className="text-meta text-shell-muted-dim mt-0.5">
                                                                    Submitted {formatRelativeTime(result.submitted_at)}
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
                                                    <div className="mt-3 flex items-center gap-3">
                                                        {result.letter_grade ? (
                                                            <Badge tone={result.passed ? 'success' : 'danger'} size="sm">
                                                                {result.letter_grade}
                                                            </Badge>
                                                        ) : null}
                                                        {result.details_visible ? (
                                                            <Button
                                                                variant="secondary"
                                                                size="sm"
                                                                className="ml-auto"
                                                                onClick={() => router.push(`/my-results/${result.session_id}`)}
                                                            >
                                                                Inspect
                                                            </Button>
                                                        ) : (
                                                            <span className="ml-auto text-meta text-shell-muted-dim">Grades only</span>
                                                        )}
                                                    </div>
                                                </Card>
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


'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import {
    Badge,
    Button,
    Card,
    EmptyState,
    PageHeader,
    Spinner,
} from '@/components/ui';
import PageShell from '@/components/layout/PageShell';
import { api } from '@/lib/api';
import { pluralizeCount } from '@/lib/pluralize';

interface GradingSession {
    session_id: string;
    test_definition_id: string;
    test_title: string;
    grading_status: 'UNGRADED' | 'PARTIALLY_GRADED' | 'FULLY_GRADED' | 'AUTO_GRADED';
    ungraded_response_count: number;
}

interface BlueprintBucket {
    test_definition_id: string;
    test_title: string;
    total_submissions: number;
    ungraded_submissions: number;
    pending_responses: number;
}

export default function GradingLandingPage() {
    const router = useRouter();
    const { user } = useAuthStore();
    const { blueprints, fetchBlueprints } = useBlueprintStore();
    const [sessions, setSessions] = useState<GradingSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (user?.role === 'STUDENT') {
            router.replace('/my-exams');
            return;
        }
        fetchBlueprints();
        api.get<GradingSession[]>('grading/sessions')
            .then((res) => setSessions(res.data ?? []))
            .catch(() => setError('Failed to load grading sessions.'))
            .finally(() => setIsLoading(false));
    }, [user, router, fetchBlueprints]);

    // Bucket sessions by blueprint to show per-test counts on each card.
    const buckets: BlueprintBucket[] = useMemo(() => {
        const map = new Map<string, BlueprintBucket>();
        for (const s of sessions) {
            const existing = map.get(s.test_definition_id);
            const isUngraded =
                s.grading_status === 'UNGRADED' || s.grading_status === 'PARTIALLY_GRADED';
            if (existing) {
                existing.total_submissions += 1;
                if (isUngraded) existing.ungraded_submissions += 1;
                existing.pending_responses += s.ungraded_response_count;
            } else {
                map.set(s.test_definition_id, {
                    test_definition_id: s.test_definition_id,
                    test_title: s.test_title,
                    total_submissions: 1,
                    ungraded_submissions: isUngraded ? 1 : 0,
                    pending_responses: s.ungraded_response_count,
                });
            }
        }
        // Sort: blueprints with pending work first, then by submission count desc.
        return Array.from(map.values()).sort((a, b) => {
            if (a.pending_responses !== b.pending_responses) {
                return b.pending_responses - a.pending_responses;
            }
            return b.total_submissions - a.total_submissions;
        });
    }, [sessions]);

    const blueprintMeta = useMemo(() => {
        const m = new Map<string, (typeof blueprints)[number]>();
        for (const b of blueprints) m.set(b.id, b);
        return m;
    }, [blueprints]);

    return (
        <PageShell width="wide">
            <PageHeader
                title="Grading"
                subtitle="Choose a blueprint to review and grade its submitted sessions."
            />

            {error && (
                <div className="mb-6 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] px-4 py-3 text-meta">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-24 gap-3 text-shell-muted-dim text-meta">
                    <Spinner size="sm" /> Loading blueprints…
                </div>
            ) : buckets.length === 0 ? (
                <EmptyState
                    title="No submissions to grade yet"
                    description="Blueprints with completed sessions appear here once students submit."
                />
            ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                    {buckets.map((bucket) => {
                        const bp = blueprintMeta.get(bucket.test_definition_id);
                        const hasPending = bucket.pending_responses > 0;
                        return (
                            <Card
                                key={bucket.test_definition_id}
                                variant="surface"
                                padding="md"
                                interactive
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="text-h3 font-semibold text-foreground">
                                            {bucket.test_title}
                                        </p>
                                        <p className="mt-1 text-meta text-shell-muted-dim line-clamp-2">
                                            {bp?.description || 'No description provided.'}
                                        </p>
                                    </div>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() =>
                                            router.push(`/grading/test/${bucket.test_definition_id}`)
                                        }
                                    >
                                        Open →
                                    </Button>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-1.5">
                                    <Badge tone="neutral" size="sm">
                                        {pluralizeCount(bucket.total_submissions, 'submission')}
                                    </Badge>
                                    {hasPending ? (
                                        <Badge tone="warning" size="sm">
                                            {pluralizeCount(bucket.pending_responses, 'ungraded response')}
                                        </Badge>
                                    ) : (
                                        <Badge tone="success" size="sm">All graded</Badge>
                                    )}
                                    {bucket.ungraded_submissions > 0 && (
                                        <Badge tone="neutral" size="sm">
                                            {bucket.ungraded_submissions} pending session
                                            {bucket.ungraded_submissions === 1 ? '' : 's'}
                                        </Badge>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </PageShell>
    );
}

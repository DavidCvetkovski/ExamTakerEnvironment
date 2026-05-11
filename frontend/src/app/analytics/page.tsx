'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useAnalyticsStore } from '@/stores/useAnalyticsStore';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';

export default function AnalyticsIndexPage() {
    const router = useRouter();
    const { blueprints, isLoading, error, fetchBlueprints } = useBlueprintStore();
    const { lastTestId } = useAnalyticsStore();

    useEffect(() => {
        if (lastTestId) {
            router.replace(`/analytics/tests/${lastTestId}`);
        } else {
            fetchBlueprints();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // run once on mount

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-full bg-shell-bg text-foreground">
                <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <PageHeader
                        eyebrow="Psychometric analysis"
                        title="Analytics dashboards"
                        subtitle="Pick a test blueprint to inspect item quality, score distribution, and version-level behaviour."
                    />

                    {error && (
                        <div className="mb-6 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] px-4 py-3 text-meta">
                            {error}
                        </div>
                    )}

                    {isLoading && blueprints.length === 0 ? (
                        <div className="flex items-center justify-center py-24 text-shell-muted-dim text-meta">
                            <div className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                            Loading available tests…
                        </div>
                    ) : !isLoading && blueprints.length === 0 ? (
                        <EmptyState
                            title="No test blueprints yet"
                            description="Create and publish a test before analytics can tell us anything useful."
                        />
                    ) : (
                        <div className="grid gap-4 lg:grid-cols-2">
                            {blueprints.map((blueprint) => (
                                <Card key={blueprint.id} variant="surface" padding="md" interactive>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="text-h3 font-semibold text-foreground">{blueprint.title}</p>
                                            <p className="mt-1 text-meta text-shell-muted-dim line-clamp-2">
                                                {blueprint.description || 'No description provided.'}
                                            </p>
                                        </div>
                                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={() => router.push(`/analytics/tests/${blueprint.id}`)}
                                        >
                                            Open →
                                        </Button>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-1.5">
                                        <Badge tone="neutral" size="sm">{blueprint.blocks.length} sections</Badge>
                                        <Badge tone="neutral" size="sm">{blueprint.duration_minutes} min</Badge>
                                        <Badge tone="accent" size="sm">
                                            Pass {blueprint.scoring_config?.pass_percentage ?? 55}%
                                        </Badge>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
}

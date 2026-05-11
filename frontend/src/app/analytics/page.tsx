'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useAnalyticsStore } from '@/stores/useAnalyticsStore';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import PageShell from '@/components/layout/PageShell';

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
            <PageShell width="wide">
                    <PageHeader
                        title="Analytics dashboards"
                        subtitle="Pick a test blueprint to inspect item quality, score distribution, and version-level behaviour."
                    />

                    {error && (
                        <div className="mb-6 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] px-4 py-3 text-meta">
                            {error}
                        </div>
                    )}

                    {isLoading && blueprints.length === 0 ? (
                        <div className="flex items-center justify-center py-24 text-shell-muted-dim text-meta gap-3">
                            <Spinner size="sm" />
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
            </PageShell>
        </ProtectedRoute>
    );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui';
import PageShell from '@/components/layout/PageShell';
import { pluralizeCount } from '@/lib/pluralize';
import { api } from '@/lib/api';
import { formatRelativeTime, formatAbsolute } from '@/lib/relativeTime';

const SHOW_BLUEPRINTS_TAB = process.env.NEXT_PUBLIC_ANALYTICS_BLUEPRINT_TAB !== 'false';

interface AnalyticsSession {
    session_id: string;
    test_definition_id: string;
    test_title: string;
    student_email: string | null;
    submitted_at: string | null;
    grading_status: string;
    percentage: number;
    ungraded_response_count: number;
}

function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
    if (!active) return null;
    return <span className="text-xs text-brand ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

type SessionSortKey = 'test_title' | 'submitted_at' | 'score';

function SessionsTab() {
    const router = useRouter();
    const [sessions, setSessions] = useState<AnalyticsSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SessionSortKey>('submitted_at');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    useEffect(() => {
        api.get<AnalyticsSession[]>('grading/sessions')
            .then((res) => setSessions(res.data ?? []))
            .catch(() => setError('Failed to load sessions.'))
            .finally(() => setIsLoading(false));
    }, []);

    const toggleSort = (key: SessionSortKey) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const sorted = [...sessions].sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'test_title') cmp = a.test_title.localeCompare(b.test_title);
        else if (sortKey === 'score') cmp = a.percentage - b.percentage;
        else cmp = (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '');
        return sortDir === 'asc' ? cmp : -cmp;
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-24 gap-3 text-shell-muted-dim text-meta">
                <Spinner size="sm" /> Loading sessions…
            </div>
        );
    }

    if (error) {
        return <p className="text-[var(--color-danger-fg)] text-meta py-4">{error}</p>;
    }

    if (sessions.length === 0) {
        return (
            <EmptyState
                title="No completed sessions yet"
                description="They'll appear here once your scheduled sessions finish."
            />
        );
    }

    return (
        <TableContainer>
            <Table>
                <THead>
                    <TR>
                        <TH>
                            <button onClick={() => toggleSort('test_title')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                                Blueprint
                                <SortArrow active={sortKey === 'test_title'} dir={sortDir} />
                            </button>
                        </TH>
                        <TH>Student</TH>
                        <TH>
                            <button onClick={() => toggleSort('submitted_at')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                                Submitted
                                <SortArrow active={sortKey === 'submitted_at'} dir={sortDir} />
                            </button>
                        </TH>
                        <TH>
                            <button onClick={() => toggleSort('score')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                                Score
                                <SortArrow active={sortKey === 'score'} dir={sortDir} />
                            </button>
                        </TH>
                        <TH align="right"></TH>
                    </TR>
                </THead>
                <TBody>
                    {sorted.map((s) => {
                        const isPending = s.ungraded_response_count > 0;
                        return (
                            <TR key={s.session_id}>
                                <TD>
                                    <span className="font-medium text-foreground">{s.test_title}</span>
                                </TD>
                                <TD>
                                    <span className="text-meta text-shell-muted-dim">{s.student_email ?? 'Anonymous'}</span>
                                </TD>
                                <TD>
                                    <span
                                        className="text-meta text-shell-muted-dim tabular-nums"
                                        title={s.submitted_at ? formatAbsolute(s.submitted_at) : undefined}
                                    >
                                        {s.submitted_at ? formatRelativeTime(s.submitted_at) : '—'}
                                    </span>
                                </TD>
                                <TD numeric>
                                    {isPending ? (
                                        <Badge tone="neutral" size="sm">Pending</Badge>
                                    ) : (
                                        <span className="font-semibold text-foreground">{s.percentage.toFixed(1)}%</span>
                                    )}
                                </TD>
                                <TD align="right">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => router.push(`/analytics/sessions/${s.session_id}`)}
                                    >
                                        Open →
                                    </Button>
                                </TD>
                            </TR>
                        );
                    })}
                </TBody>
            </Table>
        </TableContainer>
    );
}

function BlueprintsTab() {
    const router = useRouter();
    const { blueprints, isLoading, error, fetchBlueprints } = useBlueprintStore();

    useEffect(() => { fetchBlueprints(); }, [fetchBlueprints]);

    if (isLoading && blueprints.length === 0) {
        return (
            <div className="flex items-center justify-center py-24 text-shell-muted-dim text-meta gap-3">
                <Spinner size="sm" /> Loading available tests…
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] px-4 py-3 text-meta">
                {error}
            </div>
        );
    }

    if (blueprints.length === 0) {
        return (
            <EmptyState
                title="No test blueprints yet"
                description="Create and publish a test before analytics can tell us anything useful."
            />
        );
    }

    return (
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
                        <Badge tone="neutral" size="sm">{pluralizeCount(blueprint.blocks.length, 'section')}</Badge>
                        <Badge tone="neutral" size="sm">{blueprint.duration_minutes} min</Badge>
                        <Badge tone="accent" size="sm">
                            Pass {blueprint.scoring_config?.pass_percentage ?? 55}%
                        </Badge>
                    </div>
                </Card>
            ))}
        </div>
    );
}

type Tab = 'sessions' | 'blueprints';

export default function AnalyticsIndexPage() {
    const [activeTab, setActiveTab] = useState<Tab>('sessions');

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <PageShell width="wide">
                <PageHeader
                    title="Analytics"
                    subtitle="Review exam session performance and test-level quality metrics."
                />

                {/* Tab switcher */}
                <div className="flex items-center gap-0.5 bg-shell-surface border border-shell-border rounded-md p-0.5 mb-6 w-fit">
                    <button
                        onClick={() => setActiveTab('sessions')}
                        className={[
                            'px-4 py-1.5 rounded text-meta font-medium transition-colors',
                            activeTab === 'sessions'
                                ? 'bg-brand text-white'
                                : 'text-shell-muted hover:text-foreground',
                        ].join(' ')}
                    >
                        Sessions
                    </button>
                    {SHOW_BLUEPRINTS_TAB && (
                        <button
                            onClick={() => setActiveTab('blueprints')}
                            className={[
                                'px-4 py-1.5 rounded text-meta font-medium transition-colors',
                                activeTab === 'blueprints'
                                    ? 'bg-brand text-white'
                                    : 'text-shell-muted hover:text-foreground',
                            ].join(' ')}
                        >
                            Blueprints
                        </button>
                    )}
                </div>

                {activeTab === 'sessions' ? <SessionsTab /> : <BlueprintsTab />}
            </PageShell>
        </ProtectedRoute>
    );
}

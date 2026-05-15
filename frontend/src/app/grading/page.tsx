'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import {
    Badge,
    Button,
    EmptyState,
    PageHeader,
    Spinner,
    Table,
    TableContainer,
    TBody,
    TD,
    TH,
    THead,
    TR,
} from '@/components/ui';
import PageShell from '@/components/layout/PageShell';
import { api } from '@/lib/api';
import { formatRelativeTime, formatAbsolute } from '@/lib/relativeTime';
import { pluralizeCount } from '@/lib/pluralize';

interface GradingSession {
    session_id: string;
    test_definition_id: string;
    test_title: string;
    student_email: string | null;
    submitted_at: string | null;
    grading_status: 'UNGRADED' | 'PARTIALLY_GRADED' | 'FULLY_GRADED' | 'AUTO_GRADED';
    questions_graded: number;
    questions_total: number;
    ungraded_response_count: number;
    percentage: number;
}

type GradingStatusLabel = 'Not started' | 'In progress' | 'Complete';

function statusInfo(status: GradingSession['grading_status']): { label: GradingStatusLabel; tone: 'neutral' | 'warning' | 'success' } {
    if (status === 'FULLY_GRADED' || status === 'AUTO_GRADED') return { label: 'Complete', tone: 'success' };
    if (status === 'PARTIALLY_GRADED') return { label: 'In progress', tone: 'warning' };
    return { label: 'Not started', tone: 'neutral' };
}

function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
    if (!active) return null;
    return <span className="text-xs text-brand ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

type SortKey = 'test_title' | 'ungraded' | 'submitted_at' | 'status';

export default function GradingPage() {
    const router = useRouter();
    const { user } = useAuthStore();
    const [sessions, setSessions] = useState<GradingSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<SortKey>('ungraded');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    useEffect(() => {
        if (user?.role === 'STUDENT') { router.replace('/my-exams'); return; }
        api.get<GradingSession[]>('grading/sessions')
            .then((res) => setSessions(res.data ?? []))
            .catch(() => setError('Failed to load grading sessions.'))
            .finally(() => setIsLoading(false));
    }, [user, router]);

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir(key === 'ungraded' || key === 'submitted_at' ? 'desc' : 'asc');
        }
    };

    const sorted = [...sessions].sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'test_title') cmp = a.test_title.localeCompare(b.test_title);
        else if (sortKey === 'ungraded') cmp = a.ungraded_response_count - b.ungraded_response_count;
        else if (sortKey === 'status') cmp = a.grading_status.localeCompare(b.grading_status);
        else cmp = (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '');
        return sortDir === 'asc' ? cmp : -cmp;
    });

    return (
        <PageShell width="wide">
            <PageHeader
                title="Grading"
                subtitle="Review and grade submitted exam sessions."
            />

            {error && (
                <div className="mb-6 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] px-4 py-3 text-meta">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-24 gap-3 text-shell-muted-dim text-meta">
                    <Spinner size="sm" /> Loading sessions…
                </div>
            ) : sessions.length === 0 ? (
                <EmptyState
                    title="No sessions to grade"
                    description="Completed sessions appear here when they need manual grading."
                />
            ) : (
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
                                <TH>
                                    <button onClick={() => toggleSort('submitted_at')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                                        Submitted
                                        <SortArrow active={sortKey === 'submitted_at'} dir={sortDir} />
                                    </button>
                                </TH>
                                <TH>
                                    <button onClick={() => toggleSort('ungraded')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                                        Ungraded
                                        <SortArrow active={sortKey === 'ungraded'} dir={sortDir} />
                                    </button>
                                </TH>
                                <TH>
                                    <button onClick={() => toggleSort('status')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                                        Status
                                        <SortArrow active={sortKey === 'status'} dir={sortDir} />
                                    </button>
                                </TH>
                                <TH align="right"></TH>
                            </TR>
                        </THead>
                        <TBody>
                            {sorted.map((s) => {
                                const { label, tone } = statusInfo(s.grading_status);
                                return (
                                    <TR key={s.session_id}>
                                        <TD>
                                            <div className="font-medium text-foreground">{s.test_title}</div>
                                            <div className="text-meta text-shell-muted-dim">{s.student_email ?? 'Anonymous'}</div>
                                        </TD>
                                        <TD>
                                            <div
                                                className="text-meta text-shell-muted-dim tabular-nums"
                                                title={s.submitted_at ? formatAbsolute(s.submitted_at) : undefined}
                                            >
                                                {s.submitted_at ? formatRelativeTime(s.submitted_at) : '—'}
                                            </div>
                                        </TD>
                                        <TD>
                                            <span className="tabular-nums text-meta">
                                                {pluralizeCount(s.ungraded_response_count, 'response')}
                                            </span>
                                        </TD>
                                        <TD>
                                            <Badge tone={tone} size="sm">{label}</Badge>
                                        </TD>
                                        <TD align="right">
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => router.push(`/grading/${s.session_id}`)}
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
            )}
        </PageShell>
    );
}

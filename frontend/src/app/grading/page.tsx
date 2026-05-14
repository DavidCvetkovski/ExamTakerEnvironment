'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGradingStore, GradingStatus } from '@/stores/useGradingStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useAuthStore } from '@/stores/useAuthStore';
import {
    Badge,
    Button,
    EmptyState,
    PageHeader,
    Select,
    Spinner,
    StatCard,
    Table,
    TableContainer,
    TBody,
    TD,
    TH,
    THead,
    TR,
    cn,
    XIcon,
} from '@/components/ui';
import PageShell from '@/components/layout/PageShell';
import { formatAbsolute, formatRelativeTime } from '@/lib/relativeTime';

function statusBadge(status: GradingStatus) {
    const map: Record<GradingStatus, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' }> = {
        UNGRADED: { label: 'Ungraded', tone: 'neutral' },
        // Legacy AUTO_GRADED rows are functionally equivalent to FULLY_GRADED — display matches.
        AUTO_GRADED: { label: 'Fully graded', tone: 'success' },
        PARTIALLY_GRADED: { label: 'Partial', tone: 'warning' },
        FULLY_GRADED: { label: 'Fully graded', tone: 'success' },
    };
    const cfg = map[status] ?? { label: status, tone: 'neutral' as const };
    return <Badge tone={cfg.tone} size="sm">{cfg.label}</Badge>;
}

function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
    if (!active) return null;
    return (
        <span className="text-xs text-brand ml-1">
            {dir === 'asc' ? '↑' : '↓'}
        </span>
    );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
        <div className="flex items-center gap-2.5">
            <div className="flex-1 h-1 bg-shell-input-alt rounded-full overflow-hidden">
                <div
                    className="h-full bg-brand rounded-full transition-all duration-[var(--duration-slow)]"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-meta text-shell-muted-dim tabular-nums w-14 text-right">{done}/{total}</span>
        </div>
    );
}

function formatStudentLabel(email: string | null): string {
    if (!email) return 'Student Submission';
    const localPart = email.split('@')[0] ?? email;
    return localPart
        .split(/[._-]+/)
        .filter(Boolean)
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
        .join(' ');
}

export default function GradingDashboard() {
    const router = useRouter();
    const { user } = useAuthStore();
    const {
        selectedTestId, gradingOverview, overviewLoading,
        blindMode, publishStatus, error,
        setSelectedTestId,
        fetchGradingOverview, publishResults, unpublishResults,
        exportCsv, toggleBlindMode, clearError,
    } = useGradingStore();
    const { blueprints, fetchBlueprints } = useBlueprintStore();

    const [filterStatus, setFilterStatus] = useState<GradingStatus | 'ALL'>('ALL');
    const [sortKey, setSortKey] = useState<'student' | 'status' | 'percentage' | 'submitted'>('student');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    useEffect(() => { fetchBlueprints(); }, [fetchBlueprints]);
    useEffect(() => {
        if (selectedTestId) fetchGradingOverview(selectedTestId);
    }, [selectedTestId, fetchGradingOverview]);
    useEffect(() => {
        if (selectedTestId || blueprints.length === 0) return;
        const defaultBlueprint = blueprints.find(
            (b) => b.title === 'Shuffle Lab: Numbers in Motion'
        ) ?? blueprints[0];
        setSelectedTestId(defaultBlueprint.id);
    }, [blueprints, selectedTestId, setSelectedTestId]);

    if (user?.role === 'STUDENT') {
        router.replace('/my-exams');
        return null;
    }

    const isAdmin = user?.role === 'ADMIN';
    const anyPublished = gradingOverview.some(s => s.is_published);

    const toggleSort = (key: typeof sortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const filtered = gradingOverview
        .filter(s => filterStatus === 'ALL' || s.grading_status === filterStatus)
        .sort((a, b) => {
            let cmp = 0;
            if (sortKey === 'status') cmp = a.grading_status.localeCompare(b.grading_status);
            else if (sortKey === 'percentage') cmp = a.percentage - b.percentage;
            else if (sortKey === 'submitted') cmp = (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '');
            else cmp = formatStudentLabel(a.student_email).localeCompare(formatStudentLabel(b.student_email));
            return sortDir === 'asc' ? cmp : -cmp;
        });

    const stats = {
        total: gradingOverview.length,
        // AUTO_GRADED sessions have no manual work pending — count them as fully complete.
        fullyGraded: gradingOverview.filter(s =>
            s.grading_status === 'FULLY_GRADED' || s.grading_status === 'AUTO_GRADED'
        ).length,
        published: gradingOverview.filter(s => s.is_published).length,
        avgPct: gradingOverview.length
            ? Math.round(gradingOverview.reduce((a, s) => a + s.percentage, 0) / gradingOverview.length)
            : 0,
    };

    const filters: { key: GradingStatus | 'ALL'; label: string }[] = [
        { key: 'ALL', label: 'All' },
        { key: 'UNGRADED', label: 'Ungraded' },
        { key: 'PARTIALLY_GRADED', label: 'Partial' },
        { key: 'FULLY_GRADED', label: 'Fully graded' },
    ];

    return (
        <PageShell width="wide">
                <PageHeader
                    title="Grading Dashboard"
                    subtitle="Review exam submissions, finalise marks, and publish results."
                    actions={
                        <Select
                            value={selectedTestId ?? ''}
                            onChange={(e) => setSelectedTestId(e.target.value)}
                            inputSize="md"
                            className="min-w-[280px]"
                        >
                            <option value="">— Select a test —</option>
                            {blueprints.map((b) => (
                                <option key={b.id} value={b.id}>{b.title}</option>
                            ))}
                        </Select>
                    }
                />

                {error && (
                    <div className="mb-6 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] px-4 py-3 flex justify-between items-start text-meta">
                        <span>{error}</span>
                        <button onClick={clearError} aria-label="Dismiss" className="ml-4 opacity-70 hover:opacity-100"><XIcon size={14} /></button>
                    </div>
                )}

                {!selectedTestId ? (
                    <EmptyState
                        title="No test selected"
                        description="Choose a test blueprint from the dropdown above to load its grading queue."
                    />
                ) : (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <StatCard label="Total submissions" value={stats.total} />
                            <StatCard
                                label="Fully graded"
                                value={`${stats.fullyGraded} / ${stats.total}`}
                                tone="success"
                            />
                            <StatCard label="Published" value={stats.published} tone="info" />
                            <StatCard
                                label="Average score"
                                value={`${stats.avgPct}%`}
                                tone="warning"
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex items-center gap-0.5 bg-shell-surface border border-shell-border rounded-md p-0.5">
                                {filters.map((f) => (
                                    <button
                                        key={f.key}
                                        onClick={() => setFilterStatus(f.key)}
                                        className={cn(
                                            'px-3 py-1 rounded text-meta font-medium transition-colors',
                                            filterStatus === f.key
                                                ? 'bg-brand text-white'
                                                : 'text-shell-muted hover:text-foreground'
                                        )}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1" />

                            <Button
                                variant={blindMode ? 'primary' : 'secondary'}
                                size="sm"
                                onClick={toggleBlindMode}
                            >
                                {blindMode ? 'Blind ON' : 'Blind mode'}
                            </Button>

                            {isAdmin && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => selectedTestId && exportCsv(selectedTestId)}
                                >
                                    Export CSV
                                </Button>
                            )}

                            {isAdmin && (anyPublished ? (
                                <Button
                                    variant="warning"
                                    size="sm"
                                    onClick={() => selectedTestId && unpublishResults(selectedTestId)}
                                    loading={publishStatus === 'publishing'}
                                >
                                    Unpublish results
                                </Button>
                            ) : (
                                <Button
                                    variant="success"
                                    size="sm"
                                    onClick={() => selectedTestId && publishResults(selectedTestId)}
                                    loading={publishStatus === 'publishing'}
                                >
                                    Publish results
                                </Button>
                            ))}
                        </div>

                        {overviewLoading ? (
                            <div className="flex items-center justify-center py-16 text-shell-muted-dim text-meta gap-3">
                                <Spinner size="sm" />
                                Loading sessions…
                            </div>
                        ) : filtered.length === 0 ? (
                            <EmptyState title="No matches" description="No sessions match the current filter." variant="compact" />
                        ) : (
                            <TableContainer>
                                <Table>
                                    <THead>
                                        <TR>
                                            <TH>
                                                <button onClick={() => toggleSort('student')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                                                    Student
                                                    <SortArrow active={sortKey === 'student'} dir={sortDir} />
                                                </button>
                                            </TH>
                                            <TH>
                                                <button onClick={() => toggleSort('status')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                                                    Status
                                                    <SortArrow active={sortKey === 'status'} dir={sortDir} />
                                                </button>
                                            </TH>
                                            <TH>Progress</TH>
                                            <TH align="right">
                                                <button onClick={() => toggleSort('percentage')} className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors">
                                                    Score
                                                    <SortArrow active={sortKey === 'percentage'} dir={sortDir} />
                                                </button>
                                            </TH>
                                            <TH align="center">
                                                <button onClick={() => toggleSort('submitted')} className="flex items-center gap-1 mx-auto hover:text-foreground transition-colors">
                                                    Submitted
                                                    <SortArrow active={sortKey === 'submitted'} dir={sortDir} />
                                                </button>
                                            </TH>
                                            <TH align="right"></TH>
                                        </TR>
                                    </THead>
                                    <TBody>
                                        {filtered.map((session, index) => (
                                            <TR key={session.session_id}>
                                                <TD>
                                                    {blindMode ? (
                                                        <span className="text-brand text-eyebrow font-semibold uppercase tracking-eyebrow">
                                                            Submission {String(index + 1).padStart(2, '0')}
                                                        </span>
                                                    ) : (
                                                        <div>
                                                            <div className="text-foreground font-medium">
                                                                {formatStudentLabel(session.student_email)}
                                                            </div>
                                                            {session.submitted_at && (
                                                                <div
                                                                    className="text-shell-muted-dim text-meta mt-0.5"
                                                                    title={formatAbsolute(session.submitted_at)}
                                                                >
                                                                    {formatRelativeTime(session.submitted_at)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </TD>
                                                <TD>{statusBadge(session.grading_status)}</TD>
                                                <TD className="min-w-table-cell">
                                                    <ProgressBar done={session.questions_graded} total={session.questions_total} />
                                                </TD>
                                                <TD align="right" numeric>
                                                    <div className="text-foreground font-semibold">
                                                        {session.percentage.toFixed(1)}%
                                                    </div>
                                                    <div className="text-shell-muted-dim text-meta">
                                                        {session.total_points} / {session.max_points} pts
                                                    </div>
                                                </TD>
                                                <TD align="center">
                                                    <div
                                                        className="text-shell-muted-dim text-meta tabular-nums"
                                                        title={session.submitted_at ? formatAbsolute(session.submitted_at) : undefined}
                                                    >
                                                        {session.submitted_at ? formatRelativeTime(session.submitted_at) : '—'}
                                                    </div>
                                                </TD>
                                                <TD align="right">
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => router.push(`/grading/${session.session_id}`)}
                                                    >
                                                        Grade →
                                                    </Button>
                                                </TD>
                                            </TR>
                                        ))}
                                    </TBody>
                                </Table>
                            </TableContainer>
                        )}
                    </div>
                )}
        </PageShell>
    );
}

'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { deriveLockedQuestionIds, useBlueprintStore } from '@/stores/useBlueprintStore';
import { api } from '@/lib/api';
import {
    Button,
    EmptyState,
    Input,
    PageHeader,
    RowActionMenu,
    Select,
    Spinner,
    Table,
    TableContainer,
    TBody,
    TD,
    TH,
    THead,
    TR,
    useToast,
} from '@/components/ui';
import PageShell from '@/components/layout/PageShell';
import { formatRelativeTime } from '@/lib/relativeTime';
import { subjectTone } from '@/lib/subjectColor';
import { cn } from '@/components/ui/cn';

function getMetadataString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}
function getMetadataNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function LockGlyph({ count }: { count: number }) {
    return (
        <span
            className="inline-flex items-center text-shell-muted-dim"
            title={`In use by ${count} blueprint${count === 1 ? '' : 's'}`}
            aria-label={`Locked — in use by ${count} blueprint${count === 1 ? '' : 's'}`}
        >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v4A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7H5Zm1 0h4V5a2 2 0 1 0-4 0v2Z" />
            </svg>
        </span>
    );
}

type QType = 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'ESSAY';

function TypeChip({ type }: { type: QType }) {
    const map: Record<QType, { label: string; cls: string; title: string }> = {
        MULTIPLE_CHOICE: {
            label: 'SC',
            cls: 'bg-[var(--color-info-bg)] text-[var(--color-info-fg)] border-[var(--color-info-border)]',
            title: 'Single choice',
        },
        MULTIPLE_RESPONSE: {
            label: 'MC',
            cls: 'bg-[var(--color-subject-2-bg)] text-[var(--color-subject-2-fg)] border-[var(--color-subject-2-border)]',
            title: 'Multiple choice',
        },
        ESSAY: {
            label: 'ESS',
            cls: 'bg-shell-input-alt text-shell-muted border-shell-border',
            title: 'Essay',
        },
    };
    const t = map[type];
    return (
        <span
            title={t.title}
            className={cn(
                'inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded-sm border text-eyebrow font-semibold tabular-nums',
                t.cls,
            )}
        >
            {t.label}
        </span>
    );
}

function SubjectPill({ subject }: { subject: string | null }) {
    if (!subject) return <span className="text-shell-muted-dim italic">General</span>;
    const tone = subjectTone(subject);
    return (
        <span
            className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full border text-meta font-medium',
                tone.bg,
                tone.fg,
                tone.border,
            )}
        >
            {subject}
        </span>
    );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SortKey = 'preview' | 'subject' | 'points' | 'updated' | 'created';
type SortDir = 'asc' | 'desc';

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
    return (
        <span className={`text-xs ml-1 transition-colors ${active ? 'text-brand' : 'text-shell-muted-dim opacity-50'}`}>
            {dir === 'asc' ? '↑' : '↓'}
        </span>
    );
}

export default function ItemsLibraryPage() {
    return (
        <Suspense fallback={<div className="min-h-full bg-shell-bg" />}>
            <ItemsLibraryPageInner />
        </Suspense>
    );
}

function ItemsLibraryPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const imported = searchParams.get('imported') === 'true';
    const { toast } = useToast();
    const { items, isLoading, error, fetchItems, createItem, lastEditingLoId } = useLibraryStore();
    const { blueprints, fetchBlueprints, usageMap } = useBlueprintStore();
    const [isCreating, setIsCreating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [subjectFilter, setSubjectFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState<'all' | 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'ESSAY'>('all');
    const [pointsFilter, setPointsFilter] = useState<'all' | '1' | '2' | '3+'>('all');
    const [sortKey, setSortKey] = useState<SortKey>('preview');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

    useEffect(() => {
        if (lastEditingLoId) {
            router.replace(`/author?lo_id=${lastEditingLoId}`);
            return;
        }
        fetchItems();
        fetchBlueprints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Derive locked question IDs (referenced by ONGOING or PASSED blueprints).
    const lockedQuestionIds = useMemo(
        () => deriveLockedQuestionIds(blueprints, usageMap),
        [blueprints, usageMap],
    );

    // Count blueprints (any status) referencing each LO — used for the lock-glyph tooltip.
    const blueprintRefCount = useMemo(() => {
        const counts = new Map<string, number>();
        for (const bp of blueprints) {
            const seen = new Set<string>();
            for (const block of bp.blocks ?? []) {
                for (const rule of block.rules ?? []) {
                    if (rule.rule_type === 'FIXED' && rule.learning_object_id) {
                        seen.add(rule.learning_object_id);
                    }
                }
            }
            for (const loId of seen) {
                counts.set(loId, (counts.get(loId) ?? 0) + 1);
            }
        }
        return counts;
    }, [blueprints]);

    const uniqueSubjects = Array.from(
        new Set(items.map((item) => getMetadataString(item.metadata_tags?.topic)).filter((v): v is string => v !== null))
    );

    const handleColumnSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const filteredItems = useMemo(() => {
        const isIdSearch = UUID_RE.test(searchQuery.trim());
        let list = items.filter((item) => {
            const matchesSearch = isIdSearch
                ? item.id.toLowerCase() === searchQuery.trim().toLowerCase()
                : (item.latest_content_preview || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                  item.id.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesSubject = subjectFilter === 'all' || getMetadataString(item.metadata_tags?.topic) === subjectFilter;
            const matchesType = typeFilter === 'all' || item.latest_question_type === typeFilter;
            const pts = getMetadataNumber(item.metadata_tags?.points) ?? 1;
            const matchesPoints = pointsFilter === 'all' ? true :
                pointsFilter === '3+' ? pts >= 3 :
                String(pts) === pointsFilter;
            return matchesSearch && matchesSubject && matchesType && matchesPoints;
        });

        const dir = sortDir === 'asc' ? 1 : -1;
        list = [...list].sort((a, b) => {
            switch (sortKey) {
                case 'preview':
                    return dir * (a.latest_content_preview || '').localeCompare(b.latest_content_preview || '');
                case 'subject':
                    return dir * (getMetadataString(a.metadata_tags?.topic) || '').localeCompare(getMetadataString(b.metadata_tags?.topic) || '');
                case 'points':
                    return dir * ((getMetadataNumber(a.metadata_tags?.points) ?? 1) - (getMetadataNumber(b.metadata_tags?.points) ?? 1));
                case 'updated':
                    return dir * (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
                case 'created':
                    return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            }
        });

        return list;
    }, [items, searchQuery, subjectFilter, typeFilter, pointsFilter, sortKey, sortDir]);

    const handleCreateNew = async () => {
        setIsCreating(true);
        try {
            const newId = await createItem();
            router.push(`/author?lo_id=${newId}`);
        } catch (err) {
            console.error(err);
        } finally {
            setIsCreating(false);
        }
    };

    const handleDuplicate = async (id: string) => {
        setDuplicatingId(id);
        try {
            const res = await api.post<{ learning_object_id: string }>(`learning-objects/${id}/duplicate`);
            toast({ tone: 'success', title: 'Question duplicated' });
            await fetchItems();
            router.push(`/author?lo_id=${res.data.learning_object_id}`);
        } catch {
            toast({ tone: 'danger', title: 'Duplicate failed', description: 'Try again.' });
        } finally {
            setDuplicatingId(null);
        }
    };

    const handleCopyId = (id: string) => {
        navigator.clipboard.writeText(id).then(() => {
            toast({ tone: 'success', title: 'ID copied' });
        });
    };

    const thClass = 'cursor-pointer select-none hover:text-foreground transition-colors';

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <PageShell width="wide">
                <div className="space-y-6">
                    {imported && (
                        <ImportedBanner onDismiss={() => router.replace('/items')} />
                    )}
                    <PageHeader
                        title="Question Library"
                        subtitle="Browse, filter, and author the learning objects that feed every test."
                        actions={
                            <div className="flex items-center gap-2">
                                <Button variant="secondary" size="md" onClick={() => router.push('/import?mode=questions&from=library')}>
                                    Import
                                </Button>
                                <Button variant="primary" size="md" loading={isCreating} onClick={handleCreateNew}>
                                    + New question
                                </Button>
                            </div>
                        }
                    />

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[280px] space-y-1">
                            <Input
                                inputSize="md"
                                type="text"
                                placeholder="Search by content or paste a Question ID…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="min-w-filter">
                            <Select
                                inputSize="md"
                                value={subjectFilter}
                                onChange={(e) => setSubjectFilter(e.target.value)}
                            >
                                <option value="all">All subjects</option>
                                {uniqueSubjects.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </Select>
                        </div>
                        <div className="min-w-filter">
                            <Select
                                inputSize="md"
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                            >
                                <option value="all">All types</option>
                                <option value="MULTIPLE_CHOICE">Single choice</option>
                                <option value="MULTIPLE_RESPONSE">Multiple choice</option>
                                <option value="ESSAY">Essay</option>
                            </Select>
                        </div>
                        <div className="min-w-filter">
                            <Select
                                inputSize="md"
                                value={pointsFilter}
                                onChange={(e) => setPointsFilter(e.target.value as typeof pointsFilter)}
                            >
                                <option value="all">All points</option>
                                <option value="1">1 point</option>
                                <option value="2">2 points</option>
                                <option value="3+">3+ points</option>
                            </Select>
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-meta text-[var(--color-danger-fg)]">
                            {typeof error === 'string' ? error : 'An error occurred while loading items.'}
                        </div>
                    )}

                    {isLoading && items.length === 0 ? (
                        <div className="flex items-center justify-center py-16 text-shell-muted-dim text-meta gap-3">
                            <Spinner size="sm" />
                            Loading library items…
                        </div>
                    ) : items.length === 0 ? (
                        <EmptyState
                            title="No questions yet"
                            description="Get started by creating your first learning object."
                            action={
                                <Button variant="primary" size="md" onClick={handleCreateNew} loading={isCreating}>
                                    + New question
                                </Button>
                            }
                        />
                    ) : (
                        <TableContainer>
                            <Table>
                                <THead>
                                    <TR>
                                        <TH className={thClass} onClick={() => handleColumnSort('preview')}>
                                            Preview <SortArrow active={sortKey === 'preview'} dir={sortDir} />
                                        </TH>
                                        <TH className={thClass} onClick={() => handleColumnSort('subject')}>
                                            Subject <SortArrow active={sortKey === 'subject'} dir={sortDir} />
                                        </TH>
                                        <TH align="right" className={thClass} onClick={() => handleColumnSort('points')}>
                                            Points <SortArrow active={sortKey === 'points'} dir={sortDir} />
                                        </TH>
                                        <TH>Type</TH>
                                        <TH className={thClass} onClick={() => handleColumnSort('updated')}>
                                            Last edited <SortArrow active={sortKey === 'updated'} dir={sortDir} />
                                        </TH>
                                        <TH className={thClass} onClick={() => handleColumnSort('created')}>
                                            First created <SortArrow active={sortKey === 'created'} dir={sortDir} />
                                        </TH>
                                        <TH align="right"></TH>
                                    </TR>
                                </THead>
                                <TBody>
                                    {filteredItems.map((item) => {
                                        const isLocked = lockedQuestionIds.has(item.id);
                                        const refCount = blueprintRefCount.get(item.id) ?? 0;
                                        const subject = getMetadataString(item.metadata_tags?.topic);
                                        return (
                                            <TR
                                                key={item.id}
                                                onClick={() => router.push(`/author?lo_id=${item.id}`)}
                                                className="cursor-pointer"
                                            >
                                                <TD>
                                                    <div className="max-w-cell line-clamp-2 font-medium text-foreground leading-snug" title={item.latest_content_preview}>
                                                        {item.latest_content_preview || (
                                                            <span className="text-shell-muted-dim italic">Empty question</span>
                                                        )}
                                                    </div>
                                                </TD>
                                                <TD>
                                                    <SubjectPill subject={subject} />
                                                </TD>
                                                <TD align="right" numeric className="font-medium">
                                                    {getMetadataNumber(item.metadata_tags?.points) ?? 1}
                                                </TD>
                                                <TD>
                                                    <div className="flex items-center gap-2">
                                                        {refCount > 0 && <LockGlyph count={refCount} />}
                                                        <TypeChip type={item.latest_question_type as QType} />
                                                    </div>
                                                </TD>
                                                <TD className="text-shell-muted-dim tabular-nums">
                                                    {formatRelativeTime(item.updated_at || item.created_at)}
                                                </TD>
                                                <TD className="text-shell-muted-dim tabular-nums">
                                                    {formatRelativeTime(item.created_at)}
                                                </TD>
                                                <TD align="right" onClick={(e) => e.stopPropagation()}>
                                                    <RowActionMenu
                                                        ariaLabel="Question actions"
                                                        items={[
                                                            { label: 'Copy ID', onClick: () => handleCopyId(item.id) },
                                                            {
                                                                label: duplicatingId === item.id ? 'Duplicating…' : 'Duplicate',
                                                                onClick: () => handleDuplicate(item.id),
                                                                disabled: duplicatingId === item.id,
                                                            },
                                                            {
                                                                label: isLocked ? 'Inspect' : 'Edit',
                                                                onClick: () => router.push(`/author?lo_id=${item.id}`),
                                                            },
                                                        ]}
                                                    />
                                                </TD>
                                            </TR>
                                        );
                                    })}
                                </TBody>
                            </Table>
                        </TableContainer>
                    )}
                </div>
            </PageShell>
        </ProtectedRoute>
    );
}

function ImportedBanner({ onDismiss }: { onDismiss: () => void }) {
    useEffect(() => {
        const t = setTimeout(onDismiss, 8000);
        return () => clearTimeout(t);
    }, [onDismiss]);

    return (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--color-success-border)] bg-[var(--color-success-bg)]">
            <p className="text-sm font-medium text-[var(--color-success-fg)]">
                Import complete — showing newly imported items.
            </p>
            <button
                onClick={onDismiss}
                className="text-xs text-[var(--color-success-fg)] hover:underline ml-4 focus-ring rounded"
            >
                Clear x
            </button>
        </div>
    );
}

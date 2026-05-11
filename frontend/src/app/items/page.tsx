'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { deriveLockedQuestionIds, useBlueprintStore } from '@/stores/useBlueprintStore';
import { api } from '@/lib/api';
import {
    Badge,
    Button,
    EmptyState,
    Input,
    PageHeader,
    Select,
    Table,
    TableContainer,
    TBody,
    TD,
    TH,
    THead,
    TR,
    useToast,
} from '@/components/ui';

function getMetadataString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}
function getMetadataNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffDay > 30) {
        return date.toLocaleDateString();
    }

    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    if (diffDay >= 1) return rtf.format(-diffDay, 'day');
    if (diffHr >= 1) return rtf.format(-diffHr, 'hour');
    if (diffMin >= 1) return rtf.format(-diffMin, 'minute');
    return 'just now';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SortKey = 'preview' | 'subject' | 'points' | 'updated' | 'created';
type SortDir = 'asc' | 'desc' | 'none';

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
    return (
        <span className={`text-xs ml-1 transition-colors ${active && dir !== 'none' ? 'text-brand' : 'text-shell-muted-dim'}`}>
            {active && dir === 'asc' ? '↑' : active && dir === 'desc' ? '↓' : '↕'}
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
    const [sortKey, setSortKey] = useState<SortKey>('updated');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
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

    const uniqueSubjects = Array.from(
        new Set(items.map((item) => getMetadataString(item.metadata_tags?.topic)).filter((v): v is string => v !== null))
    );

    const handleColumnSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'none' ? 'asc' : d === 'asc' ? 'desc' : 'none');
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

        if (sortDir !== 'none') {
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
        } else {
            // Default: newest updated first
            list = [...list].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        }

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
            toast({ tone: 'success', title: 'Question ID copied' });
        });
    };

    const thClass = 'cursor-pointer select-none hover:text-foreground transition-colors';

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-full bg-shell-bg text-foreground">
                <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                    {imported && (
                        <ImportedBanner onDismiss={() => router.replace('/items')} />
                    )}
                    <PageHeader
                        eyebrow="Item bank"
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
                        <div className="flex items-center justify-center py-16 text-shell-muted-dim text-meta">
                            <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin mr-3" />
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
                                        return (
                                            <TR key={item.id}>
                                                <TD>
                                                    <div className="max-w-cell line-clamp-2 font-medium text-foreground leading-snug" title={item.latest_content_preview}>
                                                        {item.latest_content_preview || (
                                                            <span className="text-shell-muted-dim italic">Empty question</span>
                                                        )}
                                                    </div>
                                                </TD>
                                                <TD>
                                                    {getMetadataString(item.metadata_tags?.topic) || (
                                                        <span className="text-shell-muted-dim italic">General</span>
                                                    )}
                                                </TD>
                                                <TD align="right" numeric className="font-medium">
                                                    {getMetadataNumber(item.metadata_tags?.points) ?? 1}
                                                </TD>
                                                <TD className="text-shell-muted">
                                                    {item.latest_question_type === 'MULTIPLE_CHOICE'
                                                        ? 'Single choice'
                                                        : item.latest_question_type === 'MULTIPLE_RESPONSE'
                                                        ? 'Multiple choice'
                                                        : 'Essay'}
                                                </TD>
                                                <TD className="text-shell-muted-dim tabular-nums">
                                                    {formatRelativeTime(item.updated_at || item.created_at)}
                                                </TD>
                                                <TD className="text-shell-muted-dim tabular-nums">
                                                    {formatRelativeTime(item.created_at)}
                                                </TD>
                                                <TD align="right">
                                                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                                        {isLocked && (
                                                            <Badge tone="info" size="sm">In Blueprint</Badge>
                                                        )}
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleCopyId(item.id)}
                                                            title="Copy question ID"
                                                        >
                                                            Copy ID
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            loading={duplicatingId === item.id}
                                                            onClick={() => handleDuplicate(item.id)}
                                                        >
                                                            Duplicate
                                                        </Button>
                                                        {isLocked ? (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => router.push(`/author?lo_id=${item.id}`)}
                                                            >
                                                                View
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => router.push(`/author?lo_id=${item.id}`)}
                                                            >
                                                                Edit →
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TD>
                                            </TR>
                                        );
                                    })}
                                </TBody>
                            </Table>
                        </TableContainer>
                    )}
                </div>
            </div>
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

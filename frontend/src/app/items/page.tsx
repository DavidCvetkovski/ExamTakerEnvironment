'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { deriveLockedQuestionIds, useBlueprintStore } from '@/stores/useBlueprintStore';
import {
    Button,
    EmptyState,
    Input,
    PageHeader,
    RowActionMenu,
    Select,
    SortArrow,
    Spinner,
    Table,
    TableContainer,
    TBody,
    TD,
    TH,
    THead,
    TR,
    XIcon,
    useToast,
} from '@/components/ui';
import PageShell from '@/components/layout/PageShell';
import { useTableSort } from '@/hooks/useTableSort';
import { formatRelativeTime } from '@/lib/relativeTime';
import { subjectTone } from '@/lib/subjectColor';
import { pluralizeCount } from '@/lib/pluralize';
import { cn } from '@/components/ui/cn';

function getMetadataString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}
function getMetadataNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function LockStatus({ locked, count }: { locked: boolean; count: number }) {
    const label = locked ? 'Locked' : 'Unlocked';
    const title = locked
        ? `Locked by completed or ongoing blueprint. Referenced by ${pluralizeCount(count, 'blueprint')}.`
        : count > 0
            ? `Referenced by ${pluralizeCount(count, 'blueprint')}.`
            : 'Not used in a blueprint.';
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 text-meta',
                locked ? 'text-[var(--color-warning-fg)]' : 'text-shell-muted-dim',
            )}
            title={title}
            aria-label={`${label} - ${title}`}
        >
            {locked ? (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v4A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7H5Zm1 0h4V5a2 2 0 1 0-4 0v2Z" />
                </svg>
            ) : (
                <span aria-hidden="true">-</span>
            )}
            <span>{label}</span>
        </span>
    );
}

type QType = 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'ESSAY';

function TypeChip({ type }: { type: QType }) {
    // Labels spell out the answer model rather than relying on SC/MC
    // abbreviations, which read backwards against the internal enum names
    // (MULTIPLE_CHOICE = one correct answer; MULTIPLE_RESPONSE = several).
    const map: Record<QType, { label: string; cls: string; title: string }> = {
        MULTIPLE_CHOICE: {
            label: 'Single',
            cls: 'bg-[var(--color-info-bg)] text-[var(--color-info-fg)] border-[var(--color-info-border)]',
            title: 'Single choice — one correct answer',
        },
        MULTIPLE_RESPONSE: {
            label: 'Multiple',
            cls: 'bg-[var(--color-subject-2-bg)] text-[var(--color-subject-2-fg)] border-[var(--color-subject-2-border)]',
            title: 'Multiple response — several correct answers',
        },
        ESSAY: {
            label: 'Essay',
            cls: 'bg-shell-input-alt text-shell-muted border-shell-border',
            title: 'Essay — manually graded',
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

function TopicPill({ topic }: { topic: string | null }) {
    if (!topic) return <span className="text-shell-muted-dim italic">General</span>;
    const tone = subjectTone(topic);
    return (
        <span
            className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full border text-meta font-medium',
                tone.bg,
                tone.fg,
                tone.border,
            )}
        >
            {topic}
        </span>
    );
}

function CourseLabel({ title, code }: { title?: string | null; code?: string | null }) {
    if (!title) return <span className="text-shell-muted-dim italic">Unassigned</span>;
    return (
        <span className="font-medium text-foreground" title={code ?? undefined}>
            {title}
        </span>
    );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SortKey = 'preview' | 'course' | 'topic' | 'points' | 'type' | 'lock' | 'updated' | 'created';

// Keeps the column label + sort arrow on one line. Without this, narrow
// columns (Points, Type) wrap the arrow under the label.
function SortLabel({
    children,
    align = 'left',
}: {
    children: React.ReactNode;
    align?: 'left' | 'right';
}) {
    const base = 'inline-flex items-center whitespace-nowrap';
    const justify = align === 'right' ? ' justify-end w-full' : '';
    return <span className={base + justify}>{children}</span>;
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
    const [courseFilter, setCourseFilter] = useState('all');
    const [topicFilter, setTopicFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState<'all' | 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'ESSAY'>('all');
    const [lockFilter, setLockFilter] = useState<'all' | 'locked' | 'unlocked'>('all');
    const [pointsFilter, setPointsFilter] = useState<'all' | '1' | '2' | '3+'>('all');
    const { sortKey, sortDir, toggle: handleColumnSort } = useTableSort<SortKey>('course');

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

    const uniqueCourses = Array.from(
        new Map(
            items
                .filter((item) => item.course_id && item.course_title)
                .map((item) => [item.course_id as string, item.course_title as string])
        ).entries()
    ).sort((left, right) => left[1].localeCompare(right[1]));

    // F4 (Epoch 8.9.1): when a course is selected, only surface topics that
    // actually have items under that course — no empty topic options.
    const uniqueTopics = useMemo(() => {
        const scoped = items.filter((item) =>
            courseFilter === 'all'
                ? true
                : courseFilter === 'unassigned'
                    ? !item.course_id
                    : item.course_id === courseFilter
        );
        return Array.from(
            new Set(scoped.map((item) => getMetadataString(item.metadata_tags?.topic)).filter((v): v is string => v !== null))
        ).sort((left, right) => left.localeCompare(right));
    }, [items, courseFilter]);

    // If the active topic no longer exists under the selected course, clear it.
    useEffect(() => {
        if (topicFilter !== 'all' && !uniqueTopics.includes(topicFilter)) {
            setTopicFilter('all');
        }
    }, [uniqueTopics, topicFilter]);

    const filteredItems = useMemo(() => {
        const isIdSearch = UUID_RE.test(searchQuery.trim());
        let list = items.filter((item) => {
            const matchesSearch = isIdSearch
                ? item.id.toLowerCase() === searchQuery.trim().toLowerCase()
                : (item.latest_content_preview || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                  item.id.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCourse = courseFilter === 'all' || (courseFilter === 'unassigned' ? !item.course_id : item.course_id === courseFilter);
            const matchesTopic = topicFilter === 'all' || getMetadataString(item.metadata_tags?.topic) === topicFilter;
            const matchesType = typeFilter === 'all' || item.latest_question_type === typeFilter;
            const isLocked = lockedQuestionIds.has(item.id);
            const matchesLock = lockFilter === 'all' || (lockFilter === 'locked' ? isLocked : !isLocked);
            const pts = getMetadataNumber(item.metadata_tags?.points) ?? 1;
            const matchesPoints = pointsFilter === 'all' ? true :
                pointsFilter === '3+' ? pts >= 3 :
                String(pts) === pointsFilter;
            return matchesSearch && matchesCourse && matchesTopic && matchesType && matchesLock && matchesPoints;
        });

        const dir = sortDir === 'asc' ? 1 : -1;
        list = [...list].sort((a, b) => {
            switch (sortKey) {
                case 'preview':
                    return dir * (a.latest_content_preview || '').localeCompare(b.latest_content_preview || '');
                case 'course':
                    return dir * (a.course_title || '').localeCompare(b.course_title || '');
                case 'topic':
                    return dir * (getMetadataString(a.metadata_tags?.topic) || '').localeCompare(getMetadataString(b.metadata_tags?.topic) || '');
                case 'points':
                    return dir * ((getMetadataNumber(a.metadata_tags?.points) ?? 1) - (getMetadataNumber(b.metadata_tags?.points) ?? 1));
                case 'type':
                    return dir * (a.latest_question_type || '').localeCompare(b.latest_question_type || '');
                case 'lock':
                    return dir * (Number(lockedQuestionIds.has(a.id)) - Number(lockedQuestionIds.has(b.id)));
                case 'updated':
                    return dir * (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
                case 'created':
                    return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            }
        });

        return list;
    }, [items, searchQuery, courseFilter, topicFilter, typeFilter, lockFilter, pointsFilter, sortKey, sortDir, lockedQuestionIds]);

    const handleCreateNew = async () => {
        setIsCreating(true);
        try {
            const newId = await createItem();
            router.push(`/author?lo_id=${newId}`);
        } catch {
            toast({ tone: 'danger', title: 'Could not create question', description: 'Please try again.' });
        } finally {
            setIsCreating(false);
        }
    };

    const handleDuplicate = (id: string) => {
        // Open the editor seeded from the source as an unsaved new question.
        // Nothing is persisted until the user hits Save (see useAuthoringStore
        // seedFromSource / saveDraft create-on-save).
        router.push(`/author?seedFrom=${id}`);
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
                        subtitle="Browse, filter, and author the questions that feed every test."
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
                                aria-label="Filter by course"
                                value={courseFilter}
                                onChange={(e) => setCourseFilter(e.target.value)}
                            >
                                <option value="all">All courses</option>
                                <option value="unassigned">Unassigned</option>
                                {uniqueCourses.map(([id, title]) => (
                                    <option key={id} value={id}>{title}</option>
                                ))}
                            </Select>
                        </div>
                        <div className="min-w-filter">
                            <Select
                                inputSize="md"
                                aria-label="Filter by topic"
                                value={topicFilter}
                                onChange={(e) => setTopicFilter(e.target.value)}
                            >
                                <option value="all">All topics</option>
                                {uniqueTopics.map((topic) => (
                                    <option key={topic} value={topic}>{topic}</option>
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
                                value={lockFilter}
                                onChange={(e) => setLockFilter(e.target.value as typeof lockFilter)}
                            >
                                <option value="all">All lock states</option>
                                <option value="locked">Locked</option>
                                <option value="unlocked">Unlocked</option>
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
                            description="Get started by creating your first question."
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
                                            <SortLabel>Preview <SortArrow active={sortKey === 'preview'} dir={sortDir} /></SortLabel>
                                        </TH>
                                        <TH className={thClass} onClick={() => handleColumnSort('course')}>
                                            <SortLabel>Course <SortArrow active={sortKey === 'course'} dir={sortDir} /></SortLabel>
                                        </TH>
                                        <TH className={thClass} onClick={() => handleColumnSort('topic')}>
                                            <SortLabel>Topic <SortArrow active={sortKey === 'topic'} dir={sortDir} /></SortLabel>
                                        </TH>
                                        <TH align="right" className={thClass} onClick={() => handleColumnSort('points')}>
                                            <SortLabel align="right">Points <SortArrow active={sortKey === 'points'} dir={sortDir} /></SortLabel>
                                        </TH>
                                        <TH className={thClass} onClick={() => handleColumnSort('type')}>
                                            <SortLabel>Type <SortArrow active={sortKey === 'type'} dir={sortDir} /></SortLabel>
                                        </TH>
                                        <TH className={thClass} onClick={() => handleColumnSort('lock')}>
                                            <SortLabel>Lock <SortArrow active={sortKey === 'lock'} dir={sortDir} /></SortLabel>
                                        </TH>
                                        <TH className={thClass} onClick={() => handleColumnSort('updated')}>
                                            <SortLabel>Last edited <SortArrow active={sortKey === 'updated'} dir={sortDir} /></SortLabel>
                                        </TH>
                                        <TH className={thClass} onClick={() => handleColumnSort('created')}>
                                            <SortLabel>First created <SortArrow active={sortKey === 'created'} dir={sortDir} /></SortLabel>
                                        </TH>
                                        <TH align="right"></TH>
                                    </TR>
                                </THead>
                                <TBody>
                                    {filteredItems.map((item) => {
                                        const isLocked = lockedQuestionIds.has(item.id);
                                        const refCount = blueprintRefCount.get(item.id) ?? 0;
                                        const topic = getMetadataString(item.metadata_tags?.topic);
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
                                                    <CourseLabel title={item.course_title} code={item.course_code} />
                                                </TD>
                                                <TD>
                                                    <TopicPill topic={topic} />
                                                </TD>
                                                <TD align="right" numeric className="font-medium">
                                                    {getMetadataNumber(item.metadata_tags?.points) ?? 1}
                                                </TD>
                                                <TD>
                                                    <TypeChip type={item.latest_question_type as QType} />
                                                </TD>
                                                <TD>
                                                    <LockStatus locked={isLocked} count={refCount} />
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
                                                                label: 'Duplicate',
                                                                onClick: () => handleDuplicate(item.id),
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
                aria-label="Dismiss"
                className="inline-flex items-center gap-1 text-xs text-[var(--color-success-fg)] hover:underline ml-4 focus-ring rounded"
            >
                Clear <XIcon size={12} />
            </button>
        </div>
    );
}

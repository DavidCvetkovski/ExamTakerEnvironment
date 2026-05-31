'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { DEFAULT_SCORING_CONFIG, useBlueprintStore, SelectionRule, TestDefinition, type BlueprintStatusFilter } from '@/stores/useBlueprintStore';
import { useCourseStore } from '@/stores/useCourseStore';
import { useExamStore } from '@/stores/useExamStore';
import { useImportStore } from '@/stores/useImportStore';
import { useNavGuardStore } from '@/stores/useNavGuardStore';
import { validateBlueprint } from '@/lib/validateBlueprint';
import { canEditBlueprint, canDeleteBlueprint, type BlueprintStatus } from '@/lib/blueprintPermissions';
import { pluralizeCount } from '@/lib/pluralize';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useRouter, useSearchParams } from 'next/navigation';
import QuestionPickerModal from '@/components/blueprint/QuestionPickerModal';
import BlueprintSaveIndicator from '@/components/blueprint/BlueprintSaveIndicator';
import BlueprintStatusBadge from '@/components/blueprint/BlueprintStatusBadge';
import BlueprintInspector from '@/components/blueprint/BlueprintInspector';
import { BackButton, Badge, Button, Input, Select, Spinner, cn, useToast, useConfirm, StatusDot, XIcon, PageHeader } from '@/components/ui';
import PageShell from '@/components/layout/PageShell';
import { formatRelativeTime, formatAbsolute, formatScheduled } from '@/lib/relativeTime';

type BlueprintDraft = Partial<TestDefinition>;

export default function BlueprintPage() {
    return (
        <Suspense fallback={<div className="min-h-full bg-shell-bg" />}>
            <BlueprintPageInner />
        </Suspense>
    );
}

function BlueprintPageInner() {
    const {
        blueprints,
        currentBlueprint,
        savedSnapshot,
        availableItems,
        isLoading,
        error,
        usageMap,
        statusFilter,
        setStatusFilter,
        courseFilter,
        setCourseFilter,
        fetchBlueprints,
        fetchBlueprint,
        fetchAvailableItems,
        saveBlueprint,
        deleteBlueprint,
        duplicateBlueprint,
        resetCurrent,
        lastEditingId,
        setLastEditingId,
        viewMode,
        setViewMode,
    } = useBlueprintStore();

    const { courses, fetchCourses } = useCourseStore();
    const { instantiateSession } = useExamStore();
    const { rawText: importDraft, commitStatus: importCommitStatus } = useImportStore();
    const router = useRouter();
    const searchParams = useSearchParams();
    const idFromUrl = searchParams.get('id');
    const inspectMode = searchParams.get('inspect') === 'true';
    const { toast } = useToast();
    const { confirm, ConfirmDialog } = useConfirm();

    const [isStarting, setIsStarting] = useState(false);
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<'created_desc' | 'created_asc' | 'updated_desc' | 'duration_asc' | 'duration_desc'>('created_desc');
    const [validationErrors, setValidationErrors] = useState<ReturnType<typeof validateBlueprint> | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
    const [pickerOpen, setPickerOpen] = useState<{ blockIdx: number, ruleIdx: number } | null>(null);
    const [draggedItem, setDraggedItem] = useState<{ blockIdx: number, ruleIdx: number } | null>(null);
    const [dragOverItem, setDragOverItem] = useState<{ blockIdx: number, ruleIdx: number } | null>(null);

    const isEditing = viewMode === 'editor' || !!idFromUrl;

    useEffect(() => {
        fetchAvailableItems();
        fetchCourses();
        if (idFromUrl) {
            setLastEditingId(idFromUrl);
            fetchBlueprint(idFromUrl);
            setViewMode('editor');
        } else if (lastEditingId) {
            router.replace(`/blueprint?id=${lastEditingId}`);
        } else {
            // If the user has an in-progress import draft, redirect back to it
            if (importDraft.trim() && importCommitStatus !== 'completed') {
                router.replace('/import?mode=blueprint&from=blueprint');
                return;
            }
            fetchBlueprints();
            setViewMode('list');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idFromUrl]); // only re-run when URL id changes

    const isDirty = savedSnapshot !== null
        ? JSON.stringify(currentBlueprint) !== savedSnapshot
        : (currentBlueprint?.title?.trim() || currentBlueprint?.blocks?.some(b => b.rules.length > 0)) ?? false;

    // Stage 18b — global nav guard. Browser-level events go via beforeunload;
    // in-app nav goes via the shared store consumed by GlobalHeader.
    const setNavGuard = useNavGuardStore((s) => s.setDirty);
    useEffect(() => {
        const active = Boolean(isDirty) && viewMode === 'editor';
        setNavGuard(active, 'blueprint changes');

        if (!active) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            // Modern browsers ignore the custom message and show their own prompt,
            // but returnValue is still required to trigger it.
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => {
            window.removeEventListener('beforeunload', handler);
            setNavGuard(false);
        };
    }, [isDirty, viewMode, setNavGuard]);

    const handleCreateNew = () => {
        setLastEditingId(null);
        resetCurrent();
        setViewMode('editor');
        router.push('/blueprint');
    };

    const handleBackToList = async () => {
        if (isDirty) {
            const ok = await confirm({
                title: 'Leave without saving?',
                message: 'Your blueprint changes have not been saved. They will be lost if you leave.',
                confirmLabel: 'Leave',
                tone: 'warning',
            });
            if (!ok) return;
        }
        setLastEditingId(null);
        resetCurrent();
        setViewMode('list');
        router.push('/blueprint');
    };

    const handleDeleteBlueprint = async (bp: TestDefinition) => {
        const ok = await confirm({
            title: 'Delete blueprint?',
            message: `"${bp.title}" will be permanently removed. This cannot be undone.`,
            confirmLabel: 'Delete',
            tone: 'danger',
        });
        if (!ok) return;
        setDeletingId(bp.id);
        try {
            await deleteBlueprint(bp.id);
            toast({ tone: 'success', title: 'Blueprint deleted' });
        } catch (err) {
            toast({ tone: 'danger', title: 'Delete failed', description: err instanceof Error ? err.message : 'Try again.' });
        } finally {
            setDeletingId(null);
        }
    };

    const handleDuplicateBlueprint = async (bp: TestDefinition) => {
        setDuplicatingId(bp.id);
        try {
            await duplicateBlueprint(bp.id);
            toast({ tone: 'success', title: 'Blueprint duplicated', description: 'You can edit the new copy now.' });
        } catch (err) {
            toast({ tone: 'danger', title: 'Duplicate failed', description: err instanceof Error ? err.message : 'Try again.' });
        } finally {
            setDuplicatingId(null);
        }
    };

    const displayedBlueprints = useMemo(() => {
        let list = blueprints.filter((bp) =>
            bp.title.toLowerCase().includes(search.toLowerCase())
        );
        if (statusFilter !== 'ALL') {
            list = list.filter((bp) => (usageMap[bp.id]?.status ?? 'NEW') === statusFilter);
        }
        if (courseFilter !== 'all') {
            list = list.filter((bp) =>
                courseFilter === 'unassigned' ? !bp.course_id : bp.course_id === courseFilter
            );
        }
        if (sortKey === 'created_desc') list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        if (sortKey === 'created_asc')  list = [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        if (sortKey === 'updated_desc') list = [...list].sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime());
        if (sortKey === 'duration_asc') list = [...list].sort((a, b) => a.duration_minutes - b.duration_minutes);
        if (sortKey === 'duration_desc') list = [...list].sort((a, b) => b.duration_minutes - a.duration_minutes);
        return list;
    }, [blueprints, usageMap, statusFilter, courseFilter, search, sortKey]);

    const handleAddBlock = () => {
        if (!currentBlueprint) return;
        const newBlocks = [...(currentBlueprint.blocks || []), { title: 'New Section', rules: [] }];
        saveState({ blocks: newBlocks });
    };

    const handleAddRule = (blockIndex: number, type: 'FIXED' | 'RANDOM') => {
        if (!currentBlueprint || !currentBlueprint.blocks) return;
        const newBlocks = [...currentBlueprint.blocks];

        if (type === 'FIXED') {
            setPickerOpen({ blockIdx: blockIndex, ruleIdx: -1 });
            return;
        }

        const newRule: SelectionRule = { rule_type: 'RANDOM', count: 1, tags: [] };
        newBlocks[blockIndex].rules.push(newRule);
        saveState({ blocks: newBlocks });
    };

    const saveState = useCallback((patch: BlueprintDraft) => {
        const existingBlueprint = useBlueprintStore.getState().currentBlueprint ?? {};
        useBlueprintStore.setState({
            currentBlueprint: { ...existingBlueprint, ...patch }
        });
    }, []);

    const handleDragStart = (e: React.DragEvent, blockIdx: number, ruleIdx: number) => {
        setDraggedItem({ blockIdx, ruleIdx });
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            if (e.target instanceof HTMLElement) e.target.style.opacity = '0.5';
        }, 0);
    };

    const handleDragEnter = (e: React.DragEvent, blockIdx: number, ruleIdx: number) => {
        e.preventDefault();
        setDragOverItem({ blockIdx, ruleIdx });
    };

    const handleDragEnd = (e: React.DragEvent) => {
        if (e.target instanceof HTMLElement) e.target.style.opacity = '1';
        setDraggedItem(null);
        setDragOverItem(null);
    };

    const handleDrop = (e: React.DragEvent, targetBlockIdx: number, targetRuleIdx: number) => {
        e.preventDefault();
        if (!currentBlueprint?.blocks || !draggedItem) return;

        // Clone deeply enough for our operation to avoid strict mode double issues
        const newBlocks = currentBlueprint.blocks.map(b => ({ ...b, rules: [...b.rules] }));

        const sourceBlockIdx = draggedItem.blockIdx;
        const sourceRuleIdx = draggedItem.ruleIdx;

        // Remove from original position
        const [movedRule] = newBlocks[sourceBlockIdx].rules.splice(sourceRuleIdx, 1);

        // Insert at new position
        newBlocks[targetBlockIdx].rules.splice(targetRuleIdx, 0, movedRule);

        saveState({ blocks: newBlocks });
        setDraggedItem(null);
        setDragOverItem(null);
    };

    const handleSave = async () => {
        if (!currentBlueprint) return;

        const validation = validateBlueprint(currentBlueprint);
        setValidationErrors(validation);
        if (!validation.valid) {
            toast({
                tone: 'danger',
                title: 'Cannot save',
                description:
                    validation.titleError
                    ?? validation.structureError
                    ?? 'Fix empty sections before saving.',
            });
            return;
        }

        const minutes = currentBlueprint.duration_minutes;
        if (!minutes || minutes <= 0) {
            toast({
                tone: 'danger',
                title: 'Cannot save',
                description: 'Set a duration of at least 1 minute before saving.',
            });
            return;
        }

        try {
            const id = await saveBlueprint(currentBlueprint);
            toast({
                tone: 'success',
                title: 'Blueprint saved',
                description: currentBlueprint.title?.trim() || 'Untitled blueprint',
            });
            if (!idFromUrl) {
                router.push(`/blueprint?id=${id}`);
            }
        } catch (err) {
            toast({
                tone: 'danger',
                title: 'Save failed',
                description: err instanceof Error ? err.message : 'Try again.',
            });
        }
    };

    const handleStartPreview = async () => {
        if (!idFromUrl) return;

        const minutes = currentBlueprint?.duration_minutes;
        if (!minutes || minutes <= 0) {
            toast({
                tone: 'danger',
                title: 'Cannot start practice',
                description: 'Set a duration of at least 1 minute first.',
            });
            return;
        }

        setIsStarting(true);
        try {
            const sessionId = await instantiateSession(idFromUrl);
            router.push(`/exam/${sessionId}`);
        } catch (err) {
            toast({
                tone: 'danger',
                title: 'Practice failed',
                description: err instanceof Error ? err.message : 'Try again.',
            });
        } finally {
            setIsStarting(false);
        }
    };

    const getItemPreview = (id: string) => {
        const item = availableItems.find(i => i.id === id);
        return item ? item.latest_content_preview : 'Select a question...';
    };

    const scoringConfig = currentBlueprint?.scoring_config ?? DEFAULT_SCORING_CONFIG;
    const durationMinutes = currentBlueprint?.duration_minutes;
    const minutesValid = typeof durationMinutes === 'number' && durationMinutes > 0;
    const minutesInvalid = durationMinutes !== undefined && (typeof durationMinutes !== 'number' || durationMinutes <= 0);

    // --- Stats Calculation ---
    const stats = (() => {
        if (!currentBlueprint || !currentBlueprint.blocks) return { totalCount: 0, totalTime: 0, totalPoints: 0, topics: {} as Record<string, number> };
        let totalCount = 0;
        let totalTime = 0;
        let totalPoints = 0;
        const topics: Record<string, number> = {};

        currentBlueprint.blocks.forEach(block => {
            block.rules.forEach(rule => {
                if (rule.rule_type === 'FIXED') {
                    totalCount += 1;
                    const item = availableItems.find(i => i.id === rule.learning_object_id);
                    totalTime += item?.metadata_tags?.estimated_time_mins || 2;
                    totalPoints += item?.metadata_tags?.points || 1;
                } else {
                    totalCount += rule.count || 0;
                    totalTime += (rule.count || 0) * 3; // Estimated 3 mins for random
                    totalPoints += (rule.count || 0) * 1; // Default 1 point for random
                    if (rule.topic) {
                        topics[rule.topic] = (topics[rule.topic] || 0) + (rule.count || 0);
                    }
                }
            });
        });

        return { totalCount, totalTime, totalPoints, topics };
    })();

    if (!isEditing) {
        return (
            <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
                <PageShell width="wide">
                    {ConfirmDialog}
                    <PageHeader
                        title="Test Blueprints"
                        subtitle="Design and manage rule-based exam definitions."
                        actions={
                            <>
                                <Button variant="secondary" size="md" onClick={() => router.push('/import?mode=blueprint&from=blueprint')}>
                                    Import
                                </Button>
                                <Button variant="primary" size="md" onClick={handleCreateNew}>
                                    + New blueprint
                                </Button>
                            </>
                        }
                    />

                    {/* Sort + Search toolbar */}
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                        <div className="flex-1 min-w-[220px]">
                            <Input
                                inputSize="md"
                                type="text"
                                placeholder="Search blueprints…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="min-w-[200px]">
                            <Select
                                inputSize="md"
                                aria-label="Filter by course"
                                value={courseFilter}
                                onChange={(e) => setCourseFilter(e.target.value)}
                            >
                                <option value="all">All courses</option>
                                <option value="unassigned">Unassigned</option>
                                {courses.map((course) => (
                                    <option key={course.id} value={course.id}>{course.title}</option>
                                ))}
                            </Select>
                        </div>
                        <div className="min-w-[200px]">
                            <Select
                                inputSize="md"
                                value={sortKey}
                                onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                            >
                                <option value="created_desc">Newest first</option>
                                <option value="created_asc">Oldest first</option>
                                <option value="updated_desc">Recently edited</option>
                                <option value="duration_asc">Shortest exam</option>
                                <option value="duration_desc">Longest exam</option>
                            </Select>
                        </div>
                    </div>

                    {/* Status filter chips */}
                    <div className="inline-flex items-center gap-0.5 bg-shell-surface border border-shell-border rounded-md p-0.5 mb-8">
                        {(['ALL', 'NEW', 'SCHEDULED', 'ONGOING', 'PASSED'] as BlueprintStatusFilter[]).map((key) => {
                            const label = key === 'ALL' ? 'All' : key === 'PASSED' ? 'Completed' : key.charAt(0) + key.slice(1).toLowerCase();
                            const count = key === 'ALL'
                                ? blueprints.length
                                : blueprints.filter((bp) => (usageMap[bp.id]?.status ?? 'NEW') === key).length;
                            return (
                                <button
                                    key={key}
                                    onClick={() => setStatusFilter(key)}
                                    className={cn(
                                        'px-3 py-1 rounded text-meta font-medium transition-colors',
                                        statusFilter === key
                                            ? 'bg-brand text-white'
                                            : 'text-shell-muted hover:text-foreground'
                                    )}
                                >
                                    {label} <span className="opacity-60">({count})</span>
                                </button>
                            );
                        })}
                    </div>

                    {isLoading && blueprints.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-24 text-shell-muted-dim gap-4">
                            <Spinner size="xl" />
                            <p>Loading blueprints…</p>
                        </div>
                    )}
                    {error && (
                        <div className="p-4 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] mb-8">
                            {error}
                        </div>
                    )}

                    {!isLoading && blueprints.length === 0 && (
                        <div className="text-center py-20 bg-shell-surface/30 rounded-3xl border border-dashed border-shell-border">
                            <p className="text-shell-muted-dim mb-6">No blueprints found. Get started by creating your first one!</p>
                            <button onClick={handleCreateNew} className="text-brand font-semibold hover:underline">
                                Create Blueprint →
                            </button>
                        </div>
                    )}

                    {!isLoading && blueprints.length > 0 && displayedBlueprints.length === 0 && (
                        <div className="min-h-[40vh] flex items-center justify-center">
                            <div className="text-center max-w-md">
                                <p className="text-h3 font-semibold text-foreground mb-2">No blueprints match this filter</p>
                                <p className="text-meta text-shell-muted-dim mb-4">
                                    Pick another filter or clear it to see all blueprints.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('ALL')}
                                    className="text-meta text-brand font-medium hover:underline focus-ring rounded"
                                >
                                    Show all blueprints
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {displayedBlueprints.map((bp) => {
                            const usage = usageMap[bp.id];
                            const status: BlueprintStatus = usage?.status ?? 'NEW';
                            const canEdit = canEditBlueprint(status);
                            const canDelete = canDeleteBlueprint(status);
                            const nextSessionAt = usage?.next_session_at ?? null;

                            return (
                                <div
                                    key={bp.id}
                                    className="group relative bg-shell-surface/50 hover:bg-shell-input/80 p-6 rounded-3xl border border-shell-border hover:border-shell-border-deep transition-all backdrop-blur-sm"
                                >
                                    {/* Status badge */}
                                    <div className="absolute top-4 right-4">
                                        <BlueprintStatusBadge status={status} />
                                    </div>

                                    <h3 className="text-xl font-bold pr-24 line-clamp-2 text-foreground">{bp.title}</h3>
                                    <p className="text-shell-muted-dim text-sm mt-2 mb-1 line-clamp-2 min-h-[40px]">{bp.description || 'No description provided.'}</p>
                                    {nextSessionAt && (status === 'SCHEDULED' || status === 'ONGOING') && (
                                        <p className="text-meta text-shell-muted-dim mb-3" title={formatAbsolute(nextSessionAt)}>
                                            Next session: <span className="text-shell-muted">{formatScheduled(nextSessionAt)}</span>
                                        </p>
                                    )}

                                    <div className="flex items-center justify-between gap-3 pt-4 border-t border-shell-border text-meta text-shell-muted-dim mb-4">
                                        <div className="flex items-center gap-3 whitespace-nowrap">
                                            <span className="inline-flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-info" />
                                                {pluralizeCount(bp.blocks.length, 'section')}
                                            </span>
                                            <span className="text-shell-border">·</span>
                                            <span className="inline-flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                                                {bp.duration_minutes >= 60
                                                    ? `${Math.floor(bp.duration_minutes / 60)}h ${bp.duration_minutes % 60 ? `${bp.duration_minutes % 60}m` : ''}`.trim()
                                                    : `${bp.duration_minutes} min`}
                                            </span>
                                        </div>
                                        <span className="whitespace-nowrap" title={formatAbsolute(bp.updated_at)}>
                                            {formatRelativeTime(bp.updated_at)}
                                        </span>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center flex-wrap gap-2">
                                        {canEdit && (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => router.push(`/blueprint?id=${bp.id}`)}
                                            >
                                                Edit →
                                            </Button>
                                        )}
                                        {/* Inspect is always available — even on editable blueprints
                                          * it gives a faster read-only view than entering the editor. */}
                                        <Button
                                            variant={canEdit ? 'ghost' : 'secondary'}
                                            size="sm"
                                            onClick={() => router.push(`/blueprint?id=${bp.id}&inspect=true`)}
                                        >
                                            Inspect
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            loading={isStarting && idFromUrl === bp.id}
                                            onClick={async () => {
                                                setIsStarting(true);
                                                try {
                                                    const sessionId = await instantiateSession(bp.id);
                                                    router.push(`/exam/${sessionId}`);
                                                } catch (err) {
                                                    toast({ tone: 'danger', title: 'Practice failed', description: err instanceof Error ? err.message : 'Try again.' });
                                                } finally {
                                                    setIsStarting(false);
                                                }
                                            }}
                                        >
                                            Practice
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            loading={duplicatingId === bp.id}
                                            onClick={() => handleDuplicateBlueprint(bp)}
                                        >
                                            Duplicate
                                        </Button>
                                        {canDelete && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                loading={deletingId === bp.id}
                                                onClick={() => handleDeleteBlueprint(bp)}
                                                className="text-danger hover:bg-[var(--color-danger-bg)]"
                                            >
                                                Delete
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </PageShell>
            </ProtectedRoute>
        );
    }

    // Stage 3 — Inspect view: render the read-only inspector when ?inspect=true
    // or when the blueprint is locked (ONGOING / PASSED). Hides the entire editor
    // tree; only Back + Practice remain reachable from the page.
    const currentStatus: BlueprintStatus =
        currentBlueprint?.id ? (usageMap[currentBlueprint.id]?.status ?? 'NEW') : 'NEW';
    const lockedByStatus = currentStatus === 'ONGOING' || currentStatus === 'PASSED';

    if (currentBlueprint && (inspectMode || lockedByStatus)) {
        return (
            <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
                <div className="text-foreground">
                    {ConfirmDialog}
                    <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-8">
                        <BackButton onClick={handleBackToList} label="All blueprints" />
                    </div>
                    <BlueprintInspector
                        blueprint={currentBlueprint as TestDefinition}
                        status={currentStatus}
                        availableItems={availableItems}
                    />
                </div>
            </ProtectedRoute>
        );
    }

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="max-w-page mx-auto px-4 py-12 text-foreground sm:px-6 lg:px-8">
                {ConfirmDialog}
                <div className="flex gap-8">
                    {/* Main Editor */}
                    <div className="min-w-0 flex-1">
                        <div className="mb-6 flex items-center gap-3">
                            <BackButton onClick={handleBackToList} label="All blueprints" className="mb-0" />
                            {currentBlueprint?.id && (
                                <button
                                    type="button"
                                    onClick={() => router.push(`/blueprint?id=${currentBlueprint.id}&inspect=true`)}
                                    className="ml-auto text-meta text-shell-muted hover:text-foreground transition-colors focus-ring rounded"
                                >
                                    Inspect →
                                </button>
                            )}
                        </div>

                        <div className="min-h-blueprint-canvas overflow-hidden rounded-2xl border border-shell-border bg-shell-surface shadow-card">
                            {inspectMode && (
                                <div className="px-8 py-3 bg-[var(--color-info-bg)] border-b border-[var(--color-info-border)]">
                                    <p className="text-sm font-medium text-[var(--color-info-fg)]">
                                        This blueprint is in use and cannot be edited.
                                    </p>
                                </div>
                            )}
                            {/* Hero Section */}
                            <div className="p-8 pb-0">
                                <input
                                    type="text"
                                    placeholder="Untitled Blueprint"
                                    value={currentBlueprint?.title || ''}
                                    onChange={(e) => {
                                        if (!inspectMode) {
                                            saveState({ title: e.target.value });
                                            if (validationErrors) setValidationErrors(null);
                                        }
                                    }}
                                    readOnly={inspectMode}
                                    className={`w-full bg-transparent border-none text-foreground text-4xl font-black placeholder:text-shell-muted-dim focus:ring-0 mb-2 p-0 ${inspectMode ? 'cursor-default' : ''} ${validationErrors?.titleError ? 'border-b-2 border-danger' : ''}`}
                                />
                                {validationErrors?.titleError && (
                                    <p className="text-meta text-[var(--color-danger-fg)] mb-2">{validationErrors.titleError}</p>
                                )}
                                <textarea
                                    placeholder="Describe the purpose of this test (optional)..."
                                    value={currentBlueprint?.description || ''}
                                    onChange={(e) => saveState({ description: e.target.value })}
                                    rows={1}
                                    className="w-full bg-transparent border-none text-shell-muted-dim text-lg placeholder:text-shell-muted-dim focus:ring-0 mb-8 p-0 resize-none"
                                />

                                {/* Config Bar */}
                                <div className="flex flex-wrap items-center gap-6 p-6 bg-shell-input/40 rounded-2xl mb-12">
                                    <div className="flex-1 min-w-[180px]">
                                        <label className="mb-2 block text-eyebrow-sm font-bold uppercase tracking-widest text-brand">Course</label>
                                        <Select
                                            inputSize="md"
                                            aria-label="Course"
                                            value={currentBlueprint?.course_id ?? ''}
                                            disabled={inspectMode}
                                            onChange={(e) => saveState({ course_id: e.target.value === '' ? null : e.target.value })}
                                        >
                                            <option value="">Unassigned</option>
                                            {courses.map((course) => (
                                                <option key={course.id} value={course.id}>{course.title}</option>
                                            ))}
                                        </Select>
                                    </div>
                                    <div className="flex-1 min-w-[150px]">
                                        <label className="mb-2 block text-eyebrow-sm font-bold uppercase tracking-widest text-brand">Duration (minutes)</label>
                                        <div className="flex items-center">
                                            <input
                                                type="number"
                                                min={1}
                                                value={currentBlueprint?.duration_minutes ?? ''}
                                                onChange={(e) => saveState({
                                                    duration_minutes: e.target.value === '' ? undefined : parseInt(e.target.value, 10)
                                                })}
                                                className={`bg-shell-input border rounded-lg py-2 px-3 text-foreground focus:outline-none w-24 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                                    minutesInvalid
                                                        ? 'border-[var(--color-danger-border)] focus:border-danger'
                                                        : 'border-shell-border focus:border-brand'
                                                }`}
                                            />
                                            <span className="ml-3 text-shell-muted-dim text-sm font-medium">minutes</span>
                                        </div>
                                        {minutesInvalid ? (
                                            <p className="mt-1.5 text-meta text-[var(--color-danger-fg)]">
                                                Duration must be at least 1 minute.
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => saveState({ shuffle_questions: !currentBlueprint?.shuffle_questions })}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${currentBlueprint?.shuffle_questions ? 'bg-brand' : 'bg-shell-input-alt'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-shell-bg transition-transform ${currentBlueprint?.shuffle_questions ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                        <span className="text-sm font-semibold text-shell-muted">Shuffle Questions</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => saveState({
                                                scoring_config: {
                                                    ...scoringConfig,
                                                    shuffle_options: !scoringConfig.shuffle_options,
                                                },
                                            })}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${scoringConfig.shuffle_options ? 'bg-brand' : 'bg-shell-input-alt'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-shell-bg transition-transform ${scoringConfig.shuffle_options ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                        <span className="text-sm font-semibold text-shell-muted">Shuffle Answer Order</span>
                                    </div>
                                </div>
                            </div>

                            {/* Content Area */}
                            <div className="p-8 pt-0">
                                <div className="space-y-12">
                                    {(currentBlueprint?.blocks || []).map((block, bIdx) => {
                                        const sectionError = validationErrors?.sectionErrors?.[bIdx];
                                        return (
                                        <div key={bIdx} className="relative" data-block-idx={bIdx}>
                                            <div className="absolute -left-4 top-0 bottom-0 w-1 bg-brand/20 rounded-full"></div>
                                            <div className="flex justify-between items-center mb-6">
                                                <input
                                                    value={block.title}
                                                    onChange={(e) => {
                                                        const newBlocks = [...currentBlueprint!.blocks!];
                                                        newBlocks[bIdx].title = e.target.value;
                                                        saveState({ blocks: newBlocks });
                                                    }}
                                                    className="bg-transparent border-none text-xl font-bold text-foreground focus:ring-0 p-0"
                                                />
                                                <button
                                                    onClick={() => {
                                                        const newBlocks = [...currentBlueprint!.blocks!];
                                                        newBlocks.splice(bIdx, 1);
                                                        saveState({ blocks: newBlocks });
                                                    }}
                                                    className="text-shell-muted hover:text-danger text-sm font-medium transition-colors"
                                                >
                                                    Remove Section
                                                </button>
                                            </div>

                                            <div
                                                className="grid gap-3 min-h-[60px]"
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    // Allow dropping at the end of an empty block
                                                    if (block.rules.length === 0 && draggedItem) {
                                                        handleDrop(e, bIdx, 0);
                                                    }
                                                }}
                                            >
                                                {block.rules.length === 0 && (
                                                    <div className={`h-full min-h-[60px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-xs font-semibold uppercase tracking-widest bg-shell-input/30 ${sectionError ? 'border-danger' : 'border-shell-border'}`}>
                                                        <span className={sectionError ? 'text-danger' : 'text-shell-muted-dim'}>Empty Section</span>
                                                        {sectionError && (
                                                            <span className="normal-case tracking-normal font-medium mt-1 text-[var(--color-danger-fg)]">{sectionError}</span>
                                                        )}
                                                    </div>
                                                )}
                                                {block.rules.map((rule, rIdx) => {
                                                    const isDragOver = dragOverItem?.blockIdx === bIdx && dragOverItem?.ruleIdx === rIdx;
                                                    return (
                                                        <div
                                                            key={rIdx}
                                                            draggable
                                                            onDragStart={(e) => handleDragStart(e, bIdx, rIdx)}
                                                            onDragEnter={(e) => handleDragEnter(e, bIdx, rIdx)}
                                                            onDragEnd={handleDragEnd}
                                                            onDragOver={(e) => e.preventDefault()}
                                                            onDrop={(e) => handleDrop(e, bIdx, rIdx)}
                                                            className={`group flex flex-col gap-4 bg-shell-input/30 hover:bg-shell-input/60 border border-shell-border rounded-2xl p-4 transition-all relative cursor-move
                                                                    ${isDragOver ? 'border-t-2 border-t-brand bg-brand/10 scale-[1.02]' : ''}`}
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className="text-shell-muted-dim cursor-grab hover:text-foreground">
                                                                    &#x2630;
                                                                </div>
                                                                <Badge tone={rule.rule_type === 'FIXED' ? 'info' : 'accent'} size="sm">
                                                                    {rule.rule_type === 'FIXED' ? 'Fixed Item' : 'Smart Draw'}
                                                                </Badge>

                                                                {rule.rule_type === 'FIXED' ? (
                                                                    <div className="flex-1 flex items-center justify-between gap-4">
                                                                        <div className="text-sm font-medium text-foreground truncate">
                                                                            {rule.learning_object_id ? getItemPreview(rule.learning_object_id) : <span className="text-shell-muted">No question selected</span>}
                                                                        </div>
                                                                        <Button
                                                                            variant="secondary"
                                                                            size="sm"
                                                                            onClick={() => setPickerOpen({ blockIdx: bIdx, ruleIdx: rIdx })}
                                                                        >
                                                                            {rule.learning_object_id ? 'Change' : 'Select'}
                                                                        </Button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex-1 flex flex-wrap items-center gap-4">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-eyebrow font-bold uppercase tracking-tight text-shell-muted-dim">Quantity:</span>
                                                                            <input
                                                                                type="number"
                                                                                value={rule.count ?? ''}
                                                                                onChange={(e) => {
                                                                                    const newBlocks = [...currentBlueprint!.blocks!];
                                                                                    newBlocks[bIdx].rules[rIdx].count = e.target.value === ''
                                                                                        ? undefined
                                                                                        : parseInt(e.target.value, 10);
                                                                                    saveState({ blocks: newBlocks });
                                                                                }}
                                                                                className="w-12 bg-shell-input border border-shell-border text-foreground rounded-lg py-1 px-1 text-sm text-center focus:outline-none focus:border-brand [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                            />
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-eyebrow font-bold uppercase tracking-tight text-shell-muted-dim">Topic:</span>
                                                                            <input
                                                                                placeholder="Any Topic"
                                                                                value={rule.topic || ''}
                                                                                onChange={(e) => {
                                                                                    const newBlocks = [...currentBlueprint!.blocks!];
                                                                                    newBlocks[bIdx].rules[rIdx].topic = e.target.value;
                                                                                    saveState({ blocks: newBlocks });
                                                                                }}
                                                                                className="w-32 bg-shell-input border border-shell-border text-foreground placeholder:text-shell-muted-dim rounded-lg py-1 px-2 text-sm focus:outline-none focus:border-brand"
                                                                            />
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-eyebrow font-bold uppercase tracking-tight text-shell-muted-dim">Difficulty:</span>
                                                                            <select
                                                                                value={rule.difficulty || ''}
                                                                                onChange={(e) => {
                                                                                    const newBlocks = [...currentBlueprint!.blocks!];
                                                                                    newBlocks[bIdx].rules[rIdx].difficulty = e.target.value ? parseInt(e.target.value) : undefined;
                                                                                    saveState({ blocks: newBlocks });
                                                                                }}
                                                                                className="bg-shell-input border border-shell-border text-foreground rounded-lg py-1 px-2 text-sm focus:outline-none focus:border-brand appearance-none"
                                                                            >
                                                                                <option value="">Any</option>
                                                                                {[1, 2, 3, 4, 5].map(d => (
                                                                                    <option key={d} value={d}>Level {d}</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                <button
                                                                    onClick={() => {
                                                                        const newBlocks = [...currentBlueprint!.blocks!];
                                                                        newBlocks[bIdx].rules.splice(rIdx, 1);
                                                                        saveState({ blocks: newBlocks });
                                                                    }}
                                                                    aria-label="Remove rule"
                                                                    className="opacity-0 group-hover:opacity-100 p-2 text-shell-muted hover:text-danger transition-all ml-auto"
                                                                >
                                                                    <XIcon size={14} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>

                                            {!inspectMode && (
                                                <div className="mt-6 flex gap-3">
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => handleAddRule(bIdx, 'FIXED')}
                                                    >
                                                        <span className="mr-1.5">+</span> Specific Item
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleAddRule(bIdx, 'RANDOM')}
                                                    >
                                                        <span className="mr-1.5">+</span> Smart Rule
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        );
                                    })}
                                </div>

                                {validationErrors?.structureError && (
                                    <p className="mt-8 text-meta text-[var(--color-danger-fg)]">
                                        {validationErrors.structureError}
                                    </p>
                                )}

                                <button
                                    onClick={handleAddBlock}
                                    className="w-full mt-12 py-10 border-2 border-dashed border-shell-border rounded-3xl text-shell-muted hover:text-foreground hover:border-shell-border-deep hover:bg-shell-input/30 transition-all flex flex-col items-center justify-center gap-2"
                                >
                                    <span className="text-3xl">+</span>
                                    <span className="text-sm font-bold uppercase tracking-widest">Add New Section</span>
                                </button>
                            </div>

                            {/* Sticky Footer */}
                            <div className="sticky bottom-0 bg-shell-surface/90 backdrop-blur-xl border-t border-shell-border p-6 px-8 flex justify-between items-center z-10">
                                <div className="flex items-center gap-3">
                                    <BlueprintSaveIndicator />
                                    {isDirty && (
                                        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-medium text-warning">
                                            <StatusDot tone="warning" />
                                            Unsaved changes
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-4">
                                    {idFromUrl && (
                                        <Button
                                            variant="secondary"
                                            size="lg"
                                            onClick={handleStartPreview}
                                            disabled={isStarting || !minutesValid || !!isDirty}
                                            loading={isStarting}
                                            title={isDirty ? 'Save your changes before practicing' : undefined}
                                        >
                                            {isStarting ? 'Loading…' : 'Practice Blueprint'}
                                        </Button>
                                    )}
                                    <Button
                                        variant="success"
                                        size="lg"
                                        onClick={handleSave}
                                        disabled={!minutesValid}
                                    >
                                        Save Blueprint
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Breakdown Sidebar — hidden below 1400px to prevent horizontal scroll */}
                    <div className="hidden 2xl:block w-80 shrink-0 space-y-6">
                        <div className="sticky top-12 rounded-2xl border border-shell-border bg-shell-surface/50 p-6 backdrop-blur-md">
                            <h4 className="text-xs font-black uppercase tracking-widest text-brand mb-6 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-brand animate-pulse"></span>
                                Live Breakdown
                            </h4>

                            <div className="space-y-8">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-shell-input/50 rounded-2xl p-4">
                                        <div className="mb-1 text-eyebrow-sm font-bold uppercase text-shell-muted-dim">Items</div>
                                        <div className="text-2xl font-black text-foreground">{stats.totalCount}</div>
                                    </div>
                                    <div className="bg-shell-input/50 rounded-2xl p-4">
                                        <div className="mb-1 text-eyebrow-sm font-bold uppercase text-shell-muted-dim">Points</div>
                                        <div className="text-2xl font-black text-foreground">{stats.totalPoints}</div>
                                    </div>
                                    <div className="bg-shell-input/50 rounded-2xl p-4">
                                        <div className="mb-1 text-eyebrow-sm font-bold uppercase text-shell-muted-dim">Time</div>
                                        <div className="text-2xl font-black text-foreground">{stats.totalTime}m</div>
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-4 block text-eyebrow-sm font-bold uppercase tracking-widest text-shell-muted-dim">Topic Coverage</label>
                                    <div className="space-y-3">
                                        {Object.entries(stats.topics).length > 0 ? (
                                            Object.entries(stats.topics).map(([topic, count]) => (
                                                <div key={topic} className="space-y-1">
                                                    <div className="flex justify-between text-xs font-semibold">
                                                        <span className="text-shell-muted">{topic}</span>
                                                        <span className="text-brand">{Math.round((count / stats.totalCount) * 100)}%</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-shell-input rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-brand rounded-full transition-all duration-500"
                                                            style={{ width: `${(count / (stats.totalCount || 1)) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-xs text-shell-muted italic">No topics selected yet.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-shell-border">
                                    <div className="flex items-center justify-between p-4 bg-brand/10 rounded-2xl border border-brand/20">
                                        <div className="text-eyebrow-sm font-bold uppercase text-brand">Cognitive level</div>
                                        <div className="text-lg font-black text-foreground">Dynamic</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Question Picker */}
                <QuestionPickerModal
                    isOpen={!!pickerOpen}
                    excludeIds={currentBlueprint?.blocks?.flatMap(b => b.rules.filter(r => r.rule_type === 'FIXED' && r.learning_object_id).map(r => r.learning_object_id!)) || []}
                    onClose={() => setPickerOpen(null)}
                    onSelect={(item) => {
                        if (pickerOpen && currentBlueprint?.blocks) {
                            const newBlocks = [...currentBlueprint.blocks];
                            if (pickerOpen.ruleIdx === -1) {
                                newBlocks[pickerOpen.blockIdx].rules.push({ rule_type: 'FIXED', learning_object_id: item.id });
                            } else {
                                newBlocks[pickerOpen.blockIdx].rules[pickerOpen.ruleIdx].learning_object_id = item.id;
                            }
                            saveState({ blocks: newBlocks });
                            setPickerOpen(null);
                        }
                    }}
                />
            </div>
        </ProtectedRoute>
    );
}

'use client';

import { useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import TipTapEditor from '@/components/editor/TipTapEditor';
import MCQOptionsPanel from '@/components/editor/MCQOptionsPanel';
import EssayOptionsPanel from '@/components/editor/EssayOptionsPanel';
import QuestionInspector from '@/components/editor/QuestionInspector';
import { useAuthoringStore } from '@/stores/useAuthoringStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { deriveLockedQuestionIds, useBlueprintStore } from '@/stores/useBlueprintStore';
import { useCourseStore } from '@/stores/useCourseStore';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { BackButton, Badge, Button, Card, Field, Input, PageHeader, Select, Spinner, StatusDot, useToast, useConfirm } from '@/components/ui';
import PageShell from '@/components/layout/PageShell';

export default function AuthorPage() {
    return (
        <Suspense fallback={<div className="min-h-full bg-shell-bg" />}>
            <AuthorPageInner />
        </Suspense>
    );
}

function AuthorPageInner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const loIdParam = searchParams.get('lo_id');
    const seedFromParam = searchParams.get('seedFrom');
    const fromBlueprint = searchParams.get('from') === 'blueprint';
    const blueprintId = searchParams.get('blueprint_id');
    const fetchedRef = useRef<string | null>(null);
    const { toast } = useToast();
    const { confirm, ConfirmDialog } = useConfirm();

    const {
        saveStatus, questionType, setQuestionType,
        fetchLatestVersion, seedFromSource, learningObjectId, saveDraft, revertChanges,
        metadataTags, updateMetadataField, isDirty, isNewDraft,
        courseId, setCourseId,
        tiptapJson, options,
    } = useAuthoringStore();

    const setLastEditingLoId = useLibraryStore((s) => s.setLastEditingLoId);
    const courses = useCourseStore((s) => s.courses);
    const fetchCourses = useCourseStore((s) => s.fetchCourses);
    const blueprints = useBlueprintStore((s) => s.blueprints);
    const usageMap = useBlueprintStore((s) => s.usageMap);
    const fetchBlueprints = useBlueprintStore((s) => s.fetchBlueprints);
    const lockedQuestionIds = useMemo(
        () => deriveLockedQuestionIds(blueprints, usageMap),
        [blueprints, usageMap],
    );
    const isLocked = !!learningObjectId && lockedQuestionIds.has(learningObjectId);

    useEffect(() => {
        // Duplicate flow: seed an unsaved new question from the source. No LO
        // exists yet (created on Save), so this path has no lo_id.
        if (seedFromParam && fetchedRef.current !== `seed:${seedFromParam}`) {
            fetchedRef.current = `seed:${seedFromParam}`;
            seedFromSource(seedFromParam).catch(() => router.replace('/items'));
            return;
        }
        if (loIdParam && fetchedRef.current !== loIdParam) {
            fetchedRef.current = loIdParam;
            setLastEditingLoId(loIdParam);
            fetchLatestVersion(loIdParam).catch(() => {
                // If the LO no longer exists, clear the persisted id and bounce to /items
                setLastEditingLoId(null);
                router.replace('/items');
            });
        }
    }, [loIdParam, seedFromParam, fetchLatestVersion, seedFromSource, setLastEditingLoId, router]);

    useEffect(() => {
        // Need blueprint usage data to know whether this question is locked.
        fetchBlueprints();
        fetchCourses();
    }, [fetchBlueprints, fetchCourses]);

    // Warn on navigation with unsaved changes
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    const handleSave = async () => {
        try {
            await saveDraft();
            toast({ tone: 'success', title: 'Question saved' });
        } catch {
            toast({ tone: 'danger', title: 'Save failed', description: 'Check your connection and try again.' });
        }
    };

    const handleCopyId = () => {
        if (!learningObjectId) return;
        navigator.clipboard.writeText(learningObjectId).then(() => {
            toast({ tone: 'success', title: 'ID copied' });
        });
    };

    const statusBadge =
        saveStatus === 'SAVING' ? <Badge tone="warning" size="sm">Saving…</Badge>
        : saveStatus === 'ERROR' ? <Badge tone="danger" size="sm">Save failed</Badge>
        : null;

    async function handleBack() {
        if (isDirty) {
            const ok = await confirm({
                title: 'Leave without saving?',
                message: 'You have unsaved changes in this question. They will be lost if you leave.',
                confirmLabel: 'Leave',
                tone: 'warning',
            });
            if (!ok) return;
        }
        setLastEditingLoId(null);
        if (fromBlueprint && blueprintId) {
            router.push(`/blueprint?id=${blueprintId}`);
        } else {
            router.push('/items');
        }
    }

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <PageShell width="narrow">
                {ConfirmDialog}
                <BackButton
                    onClick={handleBack}
                    label={fromBlueprint ? 'Back to Blueprint' : 'Back to Library'}
                />

                    <PageHeader
                        title="Question authoring"
                        subtitle="Create or edit question versions for the selected learning object."
                        compact
                        actions={
                            learningObjectId ? (
                                <Button variant="secondary" size="sm" onClick={handleCopyId}>
                                    Copy ID
                                </Button>
                            ) : undefined
                        }
                    />

                    {isLocked && (
                        <div className="mb-5 rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-4 py-3 text-sm text-[var(--color-warning-fg)]">
                            This question is in active use, so it&apos;s shown read-only. To change it, duplicate the question and edit the copy.
                        </div>
                    )}

                    {isNewDraft && (
                        <div className="mb-5 rounded-xl border border-[var(--color-info-border)] bg-[var(--color-info-bg)] px-4 py-3 text-sm text-[var(--color-info-fg)]">
                            Editing a copy — click <strong>Save</strong> to create it. Leave without saving and nothing is added.
                        </div>
                    )}

                    {!learningObjectId && !isNewDraft ? (
                        <Card variant="surface" padding="lg" className="text-center">
                            <Spinner size="lg" className="mx-auto mb-3" />
                            <p className="text-shell-muted text-meta">Linking to learning object…</p>
                            <p className="text-shell-muted-dim text-meta mt-1">
                                If this persists, return to the library and try again.
                            </p>
                        </Card>
                    ) : isLocked ? (
                        // Locked items render through QuestionInspector, not the editor
                        // with disabled inputs — see CLAUDE.md §7.7 and Stage 6 of
                        // Epoch 8.5. No form elements, no metadata inputs, no save
                        // chrome. Same URL — branched render.
                        <div className="space-y-5">
                            <div className="flex items-center justify-end">
                                <Badge tone="info" size="sm">View only</Badge>
                            </div>
                            <QuestionInspector
                                questionType={questionType}
                                content={tiptapJson}
                                options={options}
                                metadataTags={metadataTags}
                            />
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <Card variant="surface" padding="md">
                                <div className="flex flex-wrap items-end gap-4 min-h-[2.5rem]">
                                    <Field label="Course" className="min-w-[220px]">
                                        <Select
                                            inputSize="sm"
                                            value={courseId ?? ''}
                                            onChange={(e) => setCourseId(e.target.value || null)}
                                        >
                                            <option value="">Unassigned</option>
                                            {courses.map((course) => (
                                                <option key={course.id} value={course.id}>
                                                    {course.title} ({course.code})
                                                </option>
                                            ))}
                                        </Select>
                                    </Field>

                                    <Field label="Topic" className="w-40">
                                        <Input
                                            inputSize="sm"
                                            type="text"
                                            placeholder="e.g. Hashing"
                                            value={(metadataTags.topic as string) || ''}
                                            onChange={(e) => updateMetadataField('topic', e.target.value)}
                                        />
                                    </Field>

                                    <Field label="Points" className="w-20">
                                        <Input
                                            inputSize="sm"
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={metadataTags.points !== undefined ? metadataTags.points as number : ''}
                                            onChange={(e) => updateMetadataField('points', e.target.value === '' ? '' : parseInt(e.target.value))}
                                        />
                                    </Field>

                                    <Field label="Type" className="min-w-[160px]">
                                        <Select
                                            inputSize="sm"
                                            value={questionType}
                                            onChange={(e) => setQuestionType(e.target.value as 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'ESSAY')}
                                        >
                                            <option value="MULTIPLE_CHOICE">Single choice</option>
                                            <option value="MULTIPLE_RESPONSE">Multiple choice</option>
                                            <option value="ESSAY">Essay</option>
                                        </Select>
                                    </Field>

                                    <div className="flex-1" />

                                    {isDirty && (
                                        <span className="inline-flex items-center gap-1.5 text-meta text-[var(--color-warning-fg)]">
                                            <StatusDot tone="warning" pulse />
                                            Unsaved
                                        </span>
                                    )}
                                    {statusBadge}

                                    <Button
                                        variant="secondary"
                                        size="md"
                                        disabled={!isDirty || saveStatus === 'SAVING'}
                                        onClick={revertChanges}
                                    >
                                        Revert
                                    </Button>

                                    <Button
                                        variant="primary"
                                        size="md"
                                        disabled={!isDirty || saveStatus === 'SAVING'}
                                        loading={saveStatus === 'SAVING'}
                                        onClick={handleSave}
                                    >
                                        Save
                                    </Button>
                                </div>
                            </Card>

                            <Card variant="bordered" padding="none" className="overflow-hidden">
                                <TipTapEditor editable={true} />
                            </Card>

                            <Card variant="bordered" padding="none" className="overflow-hidden">
                                {questionType === 'MULTIPLE_CHOICE' || questionType === 'MULTIPLE_RESPONSE' ? (
                                    <MCQOptionsPanel />
                                ) : (
                                    <EssayOptionsPanel />
                                )}
                            </Card>
                        </div>
                    )}
            </PageShell>
        </ProtectedRoute>
    );
}

'use client';

import { useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import TipTapEditor from '@/components/editor/TipTapEditor';
import MCQOptionsPanel from '@/components/editor/MCQOptionsPanel';
import EssayOptionsPanel from '@/components/editor/EssayOptionsPanel';
import { useAuthoringStore } from '@/stores/useAuthoringStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Badge, Button, Card, Field, Input, PageHeader, Select, StatusDot, cn, useToast, useConfirm } from '@/components/ui';

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
    const fromBlueprint = searchParams.get('from') === 'blueprint';
    const blueprintId = searchParams.get('blueprint_id');
    const fetchedRef = useRef<string | null>(null);
    const { toast } = useToast();
    const { confirm, ConfirmDialog } = useConfirm();

    const {
        saveStatus, questionType, setQuestionType,
        fetchLatestVersion, learningObjectId, saveDraft, revertChanges,
        metadataTags, updateMetadataField, isDirty,
    } = useAuthoringStore();

    const setLastEditingLoId = useLibraryStore((s) => s.setLastEditingLoId);
    const usageMap = useBlueprintStore((s) => s.usageMap);
    const isLocked = learningObjectId ? learningObjectId in usageMap : false;

    useEffect(() => {
        if (loIdParam && fetchedRef.current !== loIdParam) {
            fetchedRef.current = loIdParam;
            setLastEditingLoId(loIdParam);
            fetchLatestVersion(loIdParam).catch(() => {
                // If the LO no longer exists, clear the persisted id and bounce to /items
                setLastEditingLoId(null);
                router.replace('/items');
            });
        }
    }, [loIdParam, fetchLatestVersion, setLastEditingLoId, router]);

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
            toast({ tone: 'success', title: 'ID copied to clipboard' });
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
            <div className="min-h-full bg-shell-bg text-foreground">
                {ConfirmDialog}
                <div className="max-w-4xl mx-auto px-6 py-10">
                    <button
                        onClick={handleBack}
                        className={cn(
                            'mb-6 inline-flex items-center gap-2 text-meta font-medium',
                            'text-shell-muted hover:text-foreground transition-colors'
                        )}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        {fromBlueprint ? 'Back to Blueprint' : 'Back to Library'}
                    </button>

                    <PageHeader
                        eyebrow="Authoring workbench"
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
                            This question is used in a blueprint and cannot be edited.
                        </div>
                    )}

                    {!learningObjectId ? (
                        <Card variant="surface" padding="lg" className="text-center">
                            <div className="animate-spin w-6 h-6 border-2 border-brand border-t-transparent rounded-full mx-auto mb-3" />
                            <p className="text-shell-muted text-meta">Linking to learning object…</p>
                            <p className="text-shell-muted-dim text-meta mt-1">
                                If this persists, return to the library and try again.
                            </p>
                        </Card>
                    ) : (
                        <div className="space-y-5">
                            <Card variant="surface" padding="md">
                                <div className="flex flex-wrap items-end gap-4 min-h-[2.5rem]">
                                    <Field label="Subject" className="w-32">
                                        <Input
                                            inputSize="sm"
                                            type="text"
                                            placeholder="e.g. Math"
                                            value={(metadataTags.topic as string) || ''}
                                            onChange={(e) => updateMetadataField('topic', e.target.value)}
                                            disabled={isLocked}
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
                                            disabled={isLocked}
                                        />
                                    </Field>

                                    <Field label="Type" className="min-w-[160px]">
                                        <Select
                                            inputSize="sm"
                                            value={questionType}
                                            onChange={(e) => setQuestionType(e.target.value as 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'ESSAY')}
                                            disabled={isLocked}
                                        >
                                            <option value="MULTIPLE_CHOICE">Single choice</option>
                                            <option value="MULTIPLE_RESPONSE">Multiple choice</option>
                                            <option value="ESSAY">Essay</option>
                                        </Select>
                                    </Field>

                                    <div className="flex-1" />

                                    {isDirty && !isLocked && (
                                        <span className="inline-flex items-center gap-1.5 text-meta text-[var(--color-warning-fg)]">
                                            <StatusDot tone="warning" pulse />
                                            Unsaved
                                        </span>
                                    )}
                                    {statusBadge}

                                    <Button
                                        variant="secondary"
                                        size="md"
                                        disabled={isLocked || !isDirty || saveStatus === 'SAVING'}
                                        onClick={revertChanges}
                                    >
                                        Revert
                                    </Button>

                                    <Button
                                        variant="primary"
                                        size="md"
                                        disabled={isLocked || !isDirty || saveStatus === 'SAVING'}
                                        loading={saveStatus === 'SAVING'}
                                        onClick={handleSave}
                                    >
                                        Save
                                    </Button>
                                </div>
                            </Card>

                            <div className={isLocked ? 'pointer-events-none opacity-60' : undefined}>
                                <Card variant="bordered" padding="none" className="overflow-hidden">
                                    <TipTapEditor />
                                </Card>
                            </div>

                            <div className={isLocked ? 'pointer-events-none opacity-60' : undefined}>
                                <Card variant="bordered" padding="none" className="overflow-hidden">
                                    {questionType === 'MULTIPLE_CHOICE' || questionType === 'MULTIPLE_RESPONSE' ? (
                                        <MCQOptionsPanel />
                                    ) : (
                                        <EssayOptionsPanel />
                                    )}
                                </Card>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
}

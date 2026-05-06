'use client';

import { useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import TipTapEditor from '@/components/editor/TipTapEditor';
import MCQOptionsPanel from '@/components/editor/MCQOptionsPanel';
import EssayOptionsPanel from '@/components/editor/EssayOptionsPanel';
import { useAuthoringStore } from '@/stores/useAuthoringStore';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Badge, Button, Card, Field, Input, PageHeader, Select, StatusDot, cn, useToast } from '@/components/ui';

export default function AuthorPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-shell-bg" />}>
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

    const {
        saveStatus, questionType, setQuestionType,
        fetchLatestVersion, learningObjectId, saveDraft, revertChanges,
        metadataTags, updateMetadataField, isDirty,
    } = useAuthoringStore();

    useEffect(() => {
        if (loIdParam && fetchedRef.current !== loIdParam) {
            fetchedRef.current = loIdParam;
            fetchLatestVersion(loIdParam);
        }
    }, [loIdParam, fetchLatestVersion]);

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

    const statusBadge =
        saveStatus === 'SAVING' ? <Badge tone="warning" size="sm">Saving…</Badge>
        : saveStatus === 'ERROR' ? <Badge tone="danger" size="sm">Save failed</Badge>
        : null;

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-screen bg-shell-bg text-foreground">
                <div className="max-w-4xl mx-auto px-6 py-10">
                    <button
                        onClick={() => {
                            if (fromBlueprint && blueprintId) {
                                router.push(`/blueprint?id=${blueprintId}`);
                            } else {
                                router.push('/items');
                            }
                        }}
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
                    />

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
                                <TipTapEditor />
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
                </div>
            </div>
        </ProtectedRoute>
    );
}

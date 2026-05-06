'use client';

import { useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import TipTapEditor from '@/components/editor/TipTapEditor';
import MCQOptionsPanel from '@/components/editor/MCQOptionsPanel';
import EssayOptionsPanel from '@/components/editor/EssayOptionsPanel';
import { useAuthoringStore } from '@/stores/useAuthoringStore';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Badge, Button, Card, Field, Input, PageHeader, Select, cn } from '@/components/ui';

export default function AuthorPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-shell-bg" />}>
            <AuthorPageInner />
        </Suspense>
    );
}

function AuthorPageInner() {
    const searchParams = useSearchParams();
    const loIdParam = searchParams.get('lo_id');
    const fetchedRef = useRef<string | null>(null);

    const {
        saveStatus, questionType, setQuestionType,
        fetchLatestVersion, learningObjectId, saveDraft,
        metadataTags, updateMetadataField,
    } = useAuthoringStore();

    useEffect(() => {
        if (loIdParam && fetchedRef.current !== loIdParam) {
            fetchedRef.current = loIdParam;
            fetchLatestVersion(loIdParam);
        }
    }, [loIdParam, fetchLatestVersion]);

    const statusBadge =
        saveStatus === 'SAVED' ? <Badge tone="success" size="sm">Saved</Badge>
        : saveStatus === 'SAVING' ? <Badge tone="warning" size="sm">Saving…</Badge>
        : saveStatus === 'ERROR' ? <Badge tone="danger" size="sm">Save failed</Badge>
        : <Badge tone="neutral" size="sm">Ready</Badge>;

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-screen bg-shell-bg text-foreground">
                <div className="max-w-4xl mx-auto px-6 py-10">
                    <button
                        onClick={() => { window.location.href = '/items'; }}
                        className={cn(
                            'mb-6 inline-flex items-center gap-2 text-meta font-medium',
                            'text-shell-muted hover:text-foreground transition-colors'
                        )}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Back to Library
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
                                <div className="flex flex-wrap items-end gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim">
                                            Status
                                        </span>
                                        {statusBadge}
                                    </div>

                                    <div className="flex-1" />

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

                                    <Button variant="primary" size="md" onClick={saveDraft}>
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

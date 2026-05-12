'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { BackButton, Button, Badge, Spinner, useToast, useConfirm } from '@/components/ui';
import { useImportStore, ParseError } from '@/stores/useImportStore';
import FormatGuideModal from '@/components/import/FormatGuideModal';

export default function ImportPage() {
    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <Suspense fallback={<div className="min-h-full bg-shell-bg" />}>
                <ImportPageInner />
            </Suspense>
        </ProtectedRoute>
    );
}

function lineToCharOffset(text: string, lineNumber: number): number {
    const lines = text.split('\n');
    let offset = 0;
    for (let i = 0; i < Math.min(lineNumber - 1, lines.length); i++) {
        offset += lines[i].length + 1;
    }
    return offset;
}

function ImportPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const { confirm, ConfirmDialog } = useConfirm();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [showGuide, setShowGuide] = useState(false);

    const {
        rawText,
        createBlueprint,
        previewResult,
        previewLoading,
        previewError,
        commitStatus,
        commitResult,
        commitError,
        setRawText,
        setCreateBlueprint,
        fetchPreview,
        commitImport,
        reset,
    } = useImportStore();

    // Determine back destination from `from` query param (blueprints vs library)
    const fromParam = searchParams.get('from');
    const backDest = fromParam === 'blueprint' ? '/blueprint' : '/items';
    const backLabel = fromParam === 'blueprint' ? 'Back to Blueprints' : 'Back to Library';

    // Set initial mode from query param only when there is no existing draft
    useEffect(() => {
        const mode = searchParams.get('mode');
        if (rawText.trim()) return; // preserve an existing session draft
        if (mode === 'questions') setCreateBlueprint(false);
        else if (mode === 'blueprint') setCreateBlueprint(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // After successful commit, redirect to items page
    useEffect(() => {
        if (commitStatus === 'completed' && commitResult) {
            const count = commitResult.question_count;
            toast({
                tone: 'success',
                title: 'Import complete',
                description: `${count} question${count !== 1 ? 's' : ''} added to your library.`,
            });
            if (commitResult.blueprint_id) {
                toast({ tone: 'info', title: 'Blueprint created', description: 'A draft blueprint was created from this import.' });
            }
            reset();
            router.push('/items?imported=true');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [commitStatus]);

    useEffect(() => {
        if (commitError) {
            toast({ tone: 'danger', title: 'Import failed', description: commitError });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [commitError]);

    // Exit warning for browser unload
    useEffect(() => {
        const isDirty = rawText.trim().length > 0 && commitStatus !== 'completed';
        if (!isDirty) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [rawText, commitStatus]);

    function jumpToLine(line: number | null) {
        if (!line || !textareaRef.current) return;
        const offset = lineToCharOffset(rawText, line);
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(offset, offset);
    }

    async function handleNavAway(dest: string) {
        const hasDraft = rawText.trim().length > 0 && commitStatus !== 'completed';
        if (hasDraft) {
            const ok = await confirm({
                title: 'Leave this import?',
                message: 'Your pasted text will be cleared. Are you sure?',
                confirmLabel: 'Leave',
                cancelLabel: 'Stay',
                tone: 'warning',
            });
            if (!ok) return;
        }
        reset();
        router.push(dest);
    }

    const estimatedQuestions = (rawText.match(/^#Q\s/gm) || []).length;
    const canPreview = rawText.trim().length > 0;
    const canCommit = previewResult?.can_commit === true && commitStatus !== 'running';
    const isCommitting = commitStatus === 'running';

    return (
        <div className="min-h-full bg-shell-bg">
            {ConfirmDialog}
            <div className="max-w-7xl mx-auto px-6 py-8">
                {/* Back button — canonical top-left position */}
                <BackButton onClick={() => handleNavAway(backDest)} label={backLabel} />

                {/* Page header */}
                <div className="flex items-start justify-between gap-4 mb-8">
                    <div>
                        <p className="text-eyebrow text-shell-muted mb-1">Constructor Tools</p>
                        <h1 className="text-h1 text-foreground">Import Questions</h1>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setShowGuide(true)}>
                        Format Guide
                    </Button>
                </div>

                {/* Mode cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <button
                        type="button"
                        onClick={() => setCreateBlueprint(false)}
                        className={`text-left p-4 rounded-2xl border-2 transition-all ${
                            !createBlueprint
                                ? 'border-brand bg-brand/5'
                                : 'border-shell-border bg-shell-surface hover:border-shell-border-deep'
                        }`}
                    >
                        <p className="font-semibold text-foreground mb-1">Import Questions Only</p>
                        <p className="text-sm text-shell-muted">Add questions to your library (no blueprint created)</p>
                    </button>
                    <button
                        type="button"
                        onClick={() => setCreateBlueprint(true)}
                        className={`text-left p-4 rounded-2xl border-2 transition-all ${
                            createBlueprint
                                ? 'border-brand bg-brand/5'
                                : 'border-shell-border bg-shell-surface hover:border-shell-border-deep'
                        }`}
                    >
                        <p className="font-semibold text-foreground mb-1">Import + Create Blueprint</p>
                        <p className="text-sm text-shell-muted">Build a ready-to-use exam too (questions + blueprint draft)</p>
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* Left panel — input */}
                    <div className="lg:col-span-3 space-y-4">
                        {/* Textarea */}
                        <div className="bg-shell-surface rounded-2xl border border-shell-border overflow-hidden">
                            <textarea
                                ref={textareaRef}
                                value={rawText}
                                onChange={(e) => setRawText(e.target.value)}
                                placeholder={`// Paste your formatted exam text here…\n\n#BLUEPRINT\nTitle: My Exam\nDuration: 60\n\n#Q What is the capital of France?\nTYPE: MCQ\nSUBJECT: Geography\n\nA) Lyon\nB) Paris *\nC) Marseille`}
                                className="w-full h-[28rem] bg-transparent font-mono text-sm text-foreground placeholder:text-shell-muted-dim resize-none p-5 focus:outline-none"
                                spellCheck={false}
                            />
                            <div className="px-5 py-2 border-t border-shell-border bg-shell-input/30 flex items-center justify-between">
                                <span className="text-xs text-shell-muted">
                                    {rawText.length.toLocaleString()} chars
                                    {estimatedQuestions > 0 && ` · ~${estimatedQuestions} question${estimatedQuestions !== 1 ? 's' : ''} detected`}
                                </span>
                                <a
                                    href="/import-template.txt"
                                    download
                                    className="text-xs text-brand hover:underline focus-ring rounded"
                                >
                                    Download template
                                </a>
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-3">
                            <Button
                                variant="secondary"
                                onClick={fetchPreview}
                                disabled={!canPreview || previewLoading}
                                loading={previewLoading}
                            >
                                Parse &amp; Preview
                            </Button>
                            <Button
                                variant="primary"
                                onClick={commitImport}
                                disabled={!canCommit}
                                loading={isCommitting}
                            >
                                Import
                            </Button>
                        </div>
                    </div>

                    {/* Right panel — results */}
                    <div className="lg:col-span-2">
                        <ResultPanel
                            previewResult={previewResult}
                            previewLoading={previewLoading}
                            previewError={previewError}
                            onJumpToLine={jumpToLine}
                        />
                    </div>
                </div>
            </div>

            <FormatGuideModal isOpen={showGuide} onClose={() => setShowGuide(false)} />
        </div>
    );
}

interface ResultPanelProps {
    previewResult: ReturnType<typeof useImportStore.getState>['previewResult'];
    previewLoading: boolean;
    previewError: string | null;
    onJumpToLine: (line: number | null) => void;
}

function ResultPanel({ previewResult, previewLoading, previewError, onJumpToLine }: ResultPanelProps) {
    const [expandedBlock, setExpandedBlock] = useState<string | null>(null);
    const [showWarnings, setShowWarnings] = useState(false);

    if (previewLoading) {
        return (
            <div className="bg-shell-surface rounded-2xl border border-shell-border p-6 flex items-center gap-3 text-shell-muted">
                <Spinner size="sm" />
                Parsing…
            </div>
        );
    }

    if (previewError) {
        return (
            <div className="bg-shell-surface rounded-2xl border border-shell-border p-6">
                <p className="text-danger text-sm">{previewError}</p>
            </div>
        );
    }

    if (!previewResult) {
        return (
            <div className="bg-shell-surface rounded-2xl border border-shell-border p-6 flex flex-col items-center justify-center text-center min-h-48 gap-2">
                <p className="text-shell-muted text-sm">Paste your text and click <strong className="text-foreground">Parse &amp; Preview</strong> to see a breakdown here.</p>
            </div>
        );
    }

    const { can_commit, question_count, blocks, errors, warnings, has_blueprint_header, blueprint_title } = previewResult;

    return (
        <div className="space-y-4">
            <div className={`rounded-2xl border p-4 ${can_commit ? 'border-[var(--color-success-border)] bg-[var(--color-success-bg)]' : 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)]'}`}>
                <p className={`font-semibold text-sm ${can_commit ? 'text-[var(--color-success-fg)]' : 'text-[var(--color-danger-fg)]'}`}>
                    {can_commit
                        ? `✓ ${question_count} question${question_count !== 1 ? 's' : ''} parsed across ${blocks.length} block${blocks.length !== 1 ? 's' : ''}`
                        : `✗ ${errors.length} error${errors.length !== 1 ? 's' : ''} — fix before importing`
                    }
                </p>
                {has_blueprint_header && blueprint_title && (
                    <p className="text-xs text-shell-muted mt-1">Blueprint: <span className="text-foreground font-medium">{blueprint_title}</span></p>
                )}
            </div>

            {errors.length > 0 && (
                <div className="bg-shell-surface rounded-2xl border border-[var(--color-danger-border)] overflow-hidden">
                    <div className="px-4 py-3 border-b border-shell-border">
                        <p className="text-sm font-semibold text-danger">Errors ({errors.length})</p>
                    </div>
                    <div className="divide-y divide-shell-border">
                        {errors.map((err, i) => (
                            <ErrorItem key={i} error={err} onJump={onJumpToLine} />
                        ))}
                    </div>
                </div>
            )}

            {can_commit && blocks.length > 0 && (
                <div className="bg-shell-surface rounded-2xl border border-shell-border overflow-hidden">
                    <div className="px-4 py-3 border-b border-shell-border">
                        <p className="text-sm font-semibold text-foreground">Parsed Structure</p>
                    </div>
                    <div className="divide-y divide-shell-border">
                        {blocks.map((block) => (
                            <div key={block.name}>
                                <button
                                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-shell-input/30 transition-colors"
                                    onClick={() => setExpandedBlock(expandedBlock === block.name ? null : block.name)}
                                >
                                    <span className="text-sm font-medium text-foreground">{block.name}</span>
                                    <div className="flex items-center gap-2">
                                        <Badge tone="neutral" size="sm">{block.question_count} Qs</Badge>
                                        <span className="text-shell-muted text-xs">{expandedBlock === block.name ? '▲' : '▼'}</span>
                                    </div>
                                </button>
                                {expandedBlock === block.name && (
                                    <div className="px-4 pb-3 space-y-1">
                                        {block.question_summaries.map((summary, idx) => (
                                            <p key={idx} className="text-xs text-shell-muted truncate pl-2 border-l-2 border-shell-border">
                                                {summary || <em>Empty stem</em>}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {warnings.length > 0 && (
                <div className="bg-shell-surface rounded-2xl border border-[var(--color-warning-border)] overflow-hidden">
                    <button
                        className="w-full px-4 py-3 border-b border-shell-border flex items-center justify-between hover:bg-shell-input/20 transition-colors"
                        onClick={() => setShowWarnings(!showWarnings)}
                    >
                        <p className="text-sm font-semibold text-[var(--color-warning-fg)]">
                            Warnings ({warnings.length}) — non-blocking
                        </p>
                        <span className="text-shell-muted text-xs">{showWarnings ? '▲' : '▼'}</span>
                    </button>
                    {showWarnings && (
                        <div className="divide-y divide-shell-border">
                            {warnings.map((w, i) => (
                                <ErrorItem key={i} error={w} onJump={onJumpToLine} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function ErrorItem({ error, onJump }: { error: ParseError; onJump: (line: number | null) => void }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="px-4 py-3 space-y-1">
            <div className="flex items-start gap-2">
                {error.line && (
                    <button
                        onClick={() => onJump(error.line)}
                        className="shrink-0 text-xs font-mono bg-shell-input px-1.5 py-0.5 rounded text-brand hover:underline focus-ring"
                        title="Jump to line"
                    >
                        L{error.line}
                    </button>
                )}
                <p className="text-sm text-foreground flex-1">{error.message}</p>
                {error.fix_hint && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="shrink-0 text-xs text-shell-muted hover:text-foreground focus-ring rounded"
                    >
                        {expanded ? 'less' : 'hint'}
                    </button>
                )}
            </div>
            {expanded && error.fix_hint && (
                <p className="text-xs text-shell-muted pl-10 italic">{error.fix_hint}</p>
            )}
        </div>
    );
}

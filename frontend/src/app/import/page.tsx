'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Button, Badge, Field, Select, useToast } from '@/components/ui';
import { useImportStore, ParseError } from '@/stores/useImportStore';
import FormatGuideModal from '@/components/import/FormatGuideModal';

export default function ImportPage() {
    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <ImportPageInner />
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
    const { toast } = useToast();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [showGuide, setShowGuide] = useState(false);

    const {
        rawText,
        bankId,
        banks,
        createBlueprint,
        previewResult,
        previewLoading,
        previewError,
        commitStatus,
        commitResult,
        commitError,
        setRawText,
        setBankId,
        setCreateBlueprint,
        fetchBanks,
        fetchPreview,
        commitImport,
        reset,
    } = useImportStore();

    useEffect(() => {
        fetchBanks();
        return () => { reset(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // After successful commit, redirect to items page
    useEffect(() => {
        if (commitStatus === 'completed' && commitResult) {
            const count = commitResult.question_count;
            toast({ tone: 'success', title: `Import complete — ${count} question${count !== 1 ? 's' : ''} added` });

            if (commitResult.blueprint_id) {
                toast({
                    tone: 'info',
                    title: 'Blueprint created',
                    description: 'A draft blueprint was created from this import.',
                });
            }

            router.push(`/items?imported=true&bank_id=${bankId}`);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [commitStatus]);

    useEffect(() => {
        if (commitError) {
            toast({ tone: 'danger', title: 'Import failed', description: commitError });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [commitError]);

    function jumpToLine(line: number | null) {
        if (!line || !textareaRef.current) return;
        const offset = lineToCharOffset(rawText, line);
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(offset, offset);
    }

    const estimatedQuestions = (rawText.match(/^#Q\s/gm) || []).length;
    const canPreview = rawText.trim().length > 0;
    const canCommit = previewResult?.can_commit === true && !!bankId && commitStatus !== 'running';
    const isCommitting = commitStatus === 'running';

    return (
        <div className="min-h-screen bg-shell-bg">
            <div className="max-w-7xl mx-auto px-6 py-8">
                {/* Page header */}
                <div className="flex items-center gap-3 mb-8">
                    <div>
                        <p className="text-eyebrow text-shell-muted mb-1">Constructor Tools</p>
                        <h1 className="text-h1 text-foreground flex items-center gap-2">
                            Import Questions
                            <button
                                onClick={() => setShowGuide(true)}
                                className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-shell-border bg-shell-input text-shell-muted-dim text-xs font-bold hover:text-foreground hover:border-shell-border-deep focus-ring transition-colors"
                                aria-label="Open format guide"
                            >
                                i
                            </button>
                        </h1>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* Left panel — input (60%) */}
                    <div className="lg:col-span-3 space-y-4">
                        {/* Bank selector + options */}
                        <div className="bg-shell-surface rounded-2xl border border-shell-border p-5 space-y-4">
                            <Field label="Target Item Bank">
                                <Select
                                    value={bankId ?? ''}
                                    onChange={(e) => setBankId(e.target.value || null)}
                                >
                                    <option value="">— select a bank —</option>
                                    {banks.map((b) => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </Select>
                            </Field>

                            <label className="flex items-center gap-3 cursor-pointer select-none">
                                <span
                                    role="checkbox"
                                    aria-checked={createBlueprint}
                                    tabIndex={0}
                                    onClick={() => setCreateBlueprint(!createBlueprint)}
                                    onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setCreateBlueprint(!createBlueprint); }}
                                    className={`w-10 h-6 rounded-full transition-colors focus-ring cursor-pointer ${createBlueprint ? 'bg-brand' : 'bg-shell-input-alt'}`}
                                >
                                    <span className={`block w-4 h-4 rounded-full bg-shell-bg shadow transition-transform m-1 ${createBlueprint ? 'translate-x-4' : 'translate-x-0'}`} />
                                </span>
                                <span className="text-sm text-foreground">Also create a draft blueprint from this import</span>
                            </label>
                        </div>

                        {/* Textarea */}
                        <div className="bg-shell-surface rounded-2xl border border-shell-border overflow-hidden">
                            <textarea
                                ref={textareaRef}
                                value={rawText}
                                onChange={(e) => setRawText(e.target.value)}
                                placeholder={`// Paste your formatted exam text here…\n\n#BLUEPRINT\nTitle: My Exam\nDuration: 60\n\n#Q What is the capital of France?\nTYPE: MCQ\n\nA) Lyon\nB) Paris *\nC) Marseille`}
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
                                Commit Import
                            </Button>
                        </div>
                    </div>

                    {/* Right panel — results (40%) */}
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

            {showGuide && <FormatGuideModal onClose={() => setShowGuide(false)} />}
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
                <span className="animate-spin text-brand">⟳</span>
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
            {/* Summary banner */}
            <div className={`rounded-2xl border p-4 ${can_commit ? 'border-[var(--color-success-border)] bg-[var(--color-success-bg)]' : 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)]'}`}>
                <p className={`font-semibold text-sm ${can_commit ? 'text-[var(--color-success-fg)]' : 'text-[var(--color-danger-fg)]'}`}>
                    {can_commit
                        ? `✓ ${question_count} question${question_count !== 1 ? 's' : ''} parsed across ${blocks.length} block${blocks.length !== 1 ? 's' : ''}`
                        : `✗ ${errors.length} error${errors.length !== 1 ? 's' : ''} — fix before committing`
                    }
                </p>
                {has_blueprint_header && blueprint_title && (
                    <p className="text-xs text-shell-muted mt-1">Blueprint: <span className="text-foreground font-medium">{blueprint_title}</span></p>
                )}
            </div>

            {/* Errors */}
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

            {/* Blocks */}
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

            {/* Warnings */}
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

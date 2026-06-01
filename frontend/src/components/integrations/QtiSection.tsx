'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { downloadFile, downloadPost } from '@/lib/download';
import { useToast } from '@/components/ui/useToast';
import { SectionHeader } from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Input, Field } from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import QuestionPickerModal from '@/components/blueprint/QuestionPickerModal';
import type { AvailableItem } from '@/stores/useBlueprintStore';
import {
    Table,
    TableContainer,
    THead as TableHead,
    TBody as TableBody,
    TR as TableRow,
    TH as TableHeaderCell,
    TD as TableCell,
} from '@/components/ui';
import IntegrationInfo, { QTI_INFO } from '@/components/integrations/IntegrationInfo';
import type { QtiImportJobResult } from '@/lib/integrations.types';

function ExportPanel() {
    const { toast } = useToast();
    const [questionIds, setQuestionIds] = useState('');
    const [bankId, setBankId] = useState('');
    const [blueprintId, setBlueprintId] = useState('');
    const [picked, setPicked] = useState<AvailableItem[]>([]);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    const addQuestion = (item: AvailableItem) => {
        setPicked((prev) => (prev.some((p) => p.id === item.id) ? prev : [...prev, item]));
        setPickerOpen(false);
    };
    const removeQuestion = (id: string) =>
        setPicked((prev) => prev.filter((p) => p.id !== id));
    const parsedQuestionIds = questionIds
        .split(/[\s,]+/)
        .map((id) => id.trim())
        .filter(Boolean);

    const run = async (label: string, fn: () => Promise<void>) => {
        setBusy(true);
        try {
            await fn();
            toast({ tone: 'success', title: `${label} export started` });
        } catch {
            toast({ tone: 'danger', title: `${label} export failed` });
        } finally {
            setBusy(false);
        }
    };

    const exportPicked = () =>
        run('Questions', () =>
            downloadPost('qti/questions/export', 'qti-questions.zip', {
                learning_object_ids: picked.map((p) => p.id),
            })
        );
    const exportQuestionIds = () =>
        run('Question ID', () =>
            downloadPost('qti/questions/export', 'qti-questions.zip', {
                learning_object_ids: parsedQuestionIds,
            })
        );
    const exportBank = () =>
        run('Bank', () => downloadFile('qti/items/export', `qti-bank-${bankId}.zip`, { bank_id: bankId }));
    const exportBlueprint = () =>
        run('Blueprint', () =>
            downloadFile(`qti/blueprints/${blueprintId}/export`, `qti-blueprint-${blueprintId}.zip`)
        );

    return (
        <Card>
            <h3 className="text-h3 text-foreground mb-1">Export</h3>
            <p className="text-meta text-shell-muted mb-4">
                Pick individual questions, or export a whole item bank or blueprint as a QTI 2.1 package.
            </p>

            {/* Pick questions — same picker used when building a blueprint. */}
            <div className="rounded-xl border border-shell-border bg-shell-surface p-4 mb-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-body font-medium text-foreground">
                        Selected questions
                        {picked.length > 0 && (
                            <span className="text-shell-muted"> · {picked.length}</span>
                        )}
                    </p>
                    <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
                        Add question
                    </Button>
                </div>
                {picked.length === 0 ? (
                    <p className="text-meta text-shell-muted-dim">
                        No questions selected yet. Use “Add question” to browse the library.
                    </p>
                ) : (
                    <ul className="space-y-1.5 mb-3">
                        {picked.map((q) => (
                            <li
                                key={q.id}
                                className="flex items-center justify-between gap-3 rounded-lg bg-shell-input px-3 py-2"
                            >
                                <span className="text-meta text-foreground truncate">
                                    {q.latest_content_preview || q.id}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => removeQuestion(q.id)}
                                    className="text-meta text-shell-muted hover:text-[var(--color-danger-fg)]"
                                    aria-label="Remove question"
                                >
                                    Remove
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <Button onClick={exportPicked} loading={busy} disabled={picked.length === 0}>
                    Export {picked.length || ''} selected
                </Button>
            </div>

            <div className="mb-4">
                <Field
                    label="Question ID(s)"
                    hint="Paste one copied question ID, or several separated by commas/spaces."
                >
                    <div className="flex gap-2">
                        <Input
                            value={questionIds}
                            onChange={(e) => setQuestionIds(e.target.value)}
                            placeholder="question uuid"
                        />
                        <Button
                            variant="secondary"
                            onClick={exportQuestionIds}
                            loading={busy}
                            disabled={parsedQuestionIds.length === 0}
                        >
                            Export
                        </Button>
                    </div>
                </Field>
            </div>

            {/* Bulk shortcuts. */}
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Whole item bank ID" hint="Different from a question ID. Use this for an entire bank.">
                    <div className="flex gap-2">
                        <Input value={bankId} onChange={(e) => setBankId(e.target.value)} placeholder="bank uuid" />
                        <Button variant="secondary" onClick={exportBank} loading={busy} disabled={!bankId}>
                            Export
                        </Button>
                    </div>
                </Field>
                <Field label="Whole blueprint (id)">
                    <div className="flex gap-2">
                        <Input
                            value={blueprintId}
                            onChange={(e) => setBlueprintId(e.target.value)}
                            placeholder="blueprint uuid"
                        />
                        <Button variant="secondary" onClick={exportBlueprint} loading={busy} disabled={!blueprintId}>
                            Export
                        </Button>
                    </div>
                </Field>
            </div>

            <QuestionPickerModal
                isOpen={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onSelect={addQuestion}
                excludeIds={picked.map((p) => p.id)}
                title="Select Questions to Export"
                selectLabel="Select"
            />
        </Card>
    );
}

function ImportPanel() {
    const { toast } = useToast();
    const fileRef = useRef<HTMLInputElement>(null);
    const [bankId, setBankId] = useState('');
    const [busy, setBusy] = useState(false);
    const [report, setReport] = useState<QtiImportJobResult | null>(null);

    const submit = async (commit: boolean) => {
        const file = fileRef.current?.files?.[0];
        if (!file) {
            toast({ tone: 'warning', title: 'No file selected' });
            return;
        }
        if (commit && !bankId) {
            toast({
                tone: 'warning',
                title: 'Choose a target bank',
                description: 'Dry run only validates. Commit needs the item bank where new drafts should be saved.',
            });
            return;
        }
        const form = new FormData();
        form.append('file', file);
        form.append('commit', String(commit));
        if (bankId) form.append('bank_id', bankId);
        setBusy(true);
        try {
            const { data } = await api.post('qti/import', form);
            setReport(data);
            const savedText = commit ? 'saved' : 'validated, not saved';
            toast({
                tone: data.error_items ? 'warning' : 'success',
                title: commit ? 'Import committed' : 'Dry run complete',
                description: `${data.success_items} ok, ${data.error_items} errors - ${savedText}.`,
            });
        } catch (error) {
            const detail =
                typeof error === 'object' &&
                error !== null &&
                'response' in error &&
                typeof (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail === 'string'
                    ? (error as { response: { data: { detail: string } } }).response.data.detail
                    : undefined;
            toast({ tone: 'danger', title: commit ? 'Commit failed' : 'Import failed', description: detail });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <h3 className="text-h3 text-foreground mb-1">Import</h3>
            <p className="text-meta text-shell-muted mb-4">
                Upload a QTI package (.zip) or item (.xml). Dry run checks the file and reports what would happen
                without saving anything. Commit saves the ok items into the target item bank.
            </p>
            <div className="flex flex-col gap-3">
                <input
                    ref={fileRef}
                    type="file"
                    accept=".zip,.xml"
                    className="text-meta text-shell-muted file:mr-3 file:rounded-md file:border file:border-shell-border file:bg-shell-input-alt file:px-3 file:py-1.5 file:text-foreground"
                />
                <Field label="Target item bank ID" hint="Required only when committing. Dry run ignores this.">
                    <Input value={bankId} onChange={(e) => setBankId(e.target.value)} placeholder="bank uuid" />
                </Field>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => submit(false)} loading={busy}>
                        Dry run (validate only)
                    </Button>
                    <Button onClick={() => submit(true)} loading={busy} disabled={!bankId}>
                        Commit import
                    </Button>
                </div>
            </div>
            {report && (
                <div className="mt-4">
                    <p className="text-meta text-shell-muted mb-2">
                        {report.total_items} items — {report.success_items} ok, {report.error_items} errors
                        {report.committed ? ' (saved)' : ' (validated only, not saved)'}
                    </p>
                    <TableContainer>
                        <Table density="compact">
                            <TableHead>
                                <TableRow>
                                    <TableHeaderCell>Identifier</TableHeaderCell>
                                    <TableHeaderCell>Status</TableHeaderCell>
                                    <TableHeaderCell>Type / message</TableHeaderCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {report.items.map((it) => (
                                    <TableRow key={it.identifier}>
                                        <TableCell>{it.identifier}</TableCell>
                                        <TableCell>
                                            <Badge tone={it.status === 'OK' ? 'success' : 'danger'}>
                                                {it.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{it.question_type ?? it.message}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </div>
            )}
        </Card>
    );
}

export default function QtiSection() {
    return (
        <section className="space-y-4">
            <SectionHeader
                title="QTI 2.1"
                subtitle="Portable question and blueprint packages — export and import with a validation report."
                actions={<IntegrationInfo content={QTI_INFO} />}
            />
            <div className="grid gap-4 lg:grid-cols-2">
                <ExportPanel />
                <ImportPanel />
            </div>
        </section>
    );
}

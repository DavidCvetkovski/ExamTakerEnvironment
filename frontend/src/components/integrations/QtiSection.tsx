'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { useToast } from '@/components/ui/useToast';
import { SectionHeader } from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Input, Field } from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
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
    const [bankId, setBankId] = useState('');
    const [testId, setTestId] = useState('');
    const [busy, setBusy] = useState(false);

    const exportBank = async () => {
        if (!bankId) return;
        setBusy(true);
        try {
            await downloadFile('qti/items/export', `qti-bank-${bankId}.zip`, { bank_id: bankId });
            toast({ tone: 'success', title: 'Export started' });
        } catch {
            toast({ tone: 'danger', title: 'Export failed' });
        } finally {
            setBusy(false);
        }
    };

    const exportTest = async () => {
        if (!testId) return;
        setBusy(true);
        try {
            await downloadFile(`qti/tests/${testId}/export`, `qti-test-${testId}.zip`);
            toast({ tone: 'success', title: 'Export started' });
        } catch {
            toast({ tone: 'danger', title: 'Export failed' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <h3 className="text-h3 text-foreground mb-1">Export</h3>
            <p className="text-meta text-shell-muted mb-4">
                Download an item bank or test as a QTI 2.1 content package.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Item bank id">
                    <div className="flex gap-2">
                        <Input value={bankId} onChange={(e) => setBankId(e.target.value)} placeholder="uuid" />
                        <Button variant="secondary" onClick={exportBank} loading={busy} disabled={!bankId}>
                            Export
                        </Button>
                    </div>
                </Field>
                <Field label="Test definition id">
                    <div className="flex gap-2">
                        <Input value={testId} onChange={(e) => setTestId(e.target.value)} placeholder="uuid" />
                        <Button variant="secondary" onClick={exportTest} loading={busy} disabled={!testId}>
                            Export
                        </Button>
                    </div>
                </Field>
            </div>
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
            toast({ tone: 'warning', title: 'Bank id required to commit' });
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
            toast({
                tone: data.error_items ? 'warning' : 'success',
                title: commit ? 'Import committed' : 'Dry run complete',
                description: `${data.success_items} ok, ${data.error_items} errors.`,
            });
        } catch {
            toast({ tone: 'danger', title: 'Import failed' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <h3 className="text-h3 text-foreground mb-1">Import</h3>
            <p className="text-meta text-shell-muted mb-4">
                Upload a QTI package (.zip) or item (.xml). Run a dry run first, then commit into a bank.
            </p>
            <div className="flex flex-col gap-3">
                <input
                    ref={fileRef}
                    type="file"
                    accept=".zip,.xml"
                    className="text-meta text-shell-muted file:mr-3 file:rounded-md file:border file:border-shell-border file:bg-shell-input-alt file:px-3 file:py-1.5 file:text-foreground"
                />
                <Field label="Target item bank id (for commit)">
                    <Input value={bankId} onChange={(e) => setBankId(e.target.value)} placeholder="uuid" />
                </Field>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => submit(false)} loading={busy}>
                        Dry run
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
                        {report.committed ? ' (committed)' : ' (dry run)'}
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
                subtitle="Portable item/test packages — export and import with a validation report."
                actions={<IntegrationInfo content={QTI_INFO} />}
            />
            <div className="grid gap-4 lg:grid-cols-2">
                <ExportPanel />
                <ImportPanel />
            </div>
        </section>
    );
}

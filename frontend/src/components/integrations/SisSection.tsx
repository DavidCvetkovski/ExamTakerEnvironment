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
import IntegrationInfo, { SIS_INFO } from '@/components/integrations/IntegrationInfo';
import type { SisImportJobResult } from '@/lib/integrations.types';

function ImportPanel({
    title,
    endpoint,
    description,
    extraField,
}: {
    title: string;
    endpoint: string;
    description: string;
    extraField?: { name: string; label: string };
}) {
    const { toast } = useToast();
    const fileRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [checked, setChecked] = useState(false);
    const [result, setResult] = useState<SisImportJobResult | null>(null);

    const run = async () => {
        const file = fileRef.current?.files?.[0];
        if (!file) {
            toast({ tone: 'warning', title: 'No file selected' });
            return;
        }
        const form = new FormData();
        form.append('file', file);
        if (extraField) form.append(extraField.name, String(checked));
        setBusy(true);
        try {
            const { data } = await api.post(endpoint, form);
            setResult(data);
            toast({
                tone: data.error_rows ? 'warning' : 'success',
                title: 'Import finished',
                description: `${data.success_rows} ok, ${data.error_rows} errors.`,
            });
        } catch {
            toast({ tone: 'danger', title: 'Import failed' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <h3 className="text-h3 text-foreground mb-1">{title}</h3>
            <p className="text-meta text-shell-muted mb-4">{description}</p>
            <div className="flex flex-col gap-3">
                <input
                    ref={fileRef}
                    type="file"
                    accept=".csv"
                    className="text-meta text-shell-muted file:mr-3 file:rounded-md file:border file:border-shell-border file:bg-shell-input-alt file:px-3 file:py-1.5 file:text-foreground"
                />
                {extraField && (
                    <label className="flex items-center gap-2 text-meta text-shell-muted">
                        <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setChecked(e.target.checked)}
                        />
                        {extraField.label}
                    </label>
                )}
                <div>
                    <Button onClick={run} loading={busy}>
                        Upload CSV
                    </Button>
                </div>
            </div>
            {result && (
                <div className="mt-4">
                    <p className="text-meta text-shell-muted mb-2">
                        {result.total_rows} rows — {result.success_rows} ok, {result.error_rows} errors
                    </p>
                    {result.rows.some((r) => r.status === 'ERROR') && (
                        <TableContainer>
                            <Table density="compact">
                                <TableHead>
                                    <TableRow>
                                        <TableHeaderCell>Row</TableHeaderCell>
                                        <TableHeaderCell>Status</TableHeaderCell>
                                        <TableHeaderCell>Message</TableHeaderCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {result.rows
                                        .filter((r) => r.status === 'ERROR')
                                        .map((r) => (
                                            <TableRow key={r.row_number}>
                                                <TableCell>{r.row_number}</TableCell>
                                                <TableCell>
                                                    <Badge tone="danger">{r.status}</Badge>
                                                </TableCell>
                                                <TableCell>{r.message}</TableCell>
                                            </TableRow>
                                        ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </div>
            )}
        </Card>
    );
}

function GradeExportPanel() {
    const { toast } = useToast();
    const [courseId, setCourseId] = useState('');
    const [sessionId, setSessionId] = useState('');
    const [busy, setBusy] = useState(false);

    const run = async () => {
        if (!courseId && !sessionId) {
            toast({ tone: 'warning', title: 'Add a filter', description: 'Course or session id required.' });
            return;
        }
        setBusy(true);
        try {
            await downloadFile('sis/grades/export', 'grades_export.csv', {
                course_id: courseId || undefined,
                scheduled_session_id: sessionId || undefined,
            });
            toast({ tone: 'success', title: 'Export started' });
        } catch {
            toast({ tone: 'danger', title: 'Export failed' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <h3 className="text-h3 text-foreground mb-1">Grade export</h3>
            <p className="text-meta text-shell-muted mb-4">
                Download published results as an Osiris-compatible CSV. At least one filter is required.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Course id">
                    <Input value={courseId} onChange={(e) => setCourseId(e.target.value)} placeholder="uuid" />
                </Field>
                <Field label="Scheduled session id">
                    <Input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="uuid" />
                </Field>
            </div>
            <div className="mt-4">
                <Button variant="secondary" onClick={run} loading={busy}>
                    Download CSV
                </Button>
            </div>
        </Card>
    );
}

export default function SisSection() {
    return (
        <section className="space-y-4">
            <SectionHeader
                title="SIS / Osiris"
                subtitle="Import rosters and accommodations, export grades."
                actions={<IntegrationInfo content={SIS_INFO} />}
            />
            <div className="grid gap-4 lg:grid-cols-2">
                <ImportPanel
                    title="Roster import"
                    endpoint="sis/rosters/import"
                    description="CSV columns: course_code, vunet_id, email, first_name, last_name, role, is_active."
                    extraField={{ name: 'create_missing_courses', label: 'Create missing courses' }}
                />
                <ImportPanel
                    title="Accommodation import"
                    endpoint="sis/accommodations/import"
                    description="CSV columns: vunet_id, provision_time_multiplier, enlarged_display."
                />
            </div>
            <GradeExportPanel />
        </section>
    );
}

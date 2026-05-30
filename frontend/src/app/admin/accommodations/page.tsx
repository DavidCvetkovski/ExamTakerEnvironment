'use client';

import { useEffect, useRef, useState } from 'react';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import PageShell from '@/components/layout/PageShell';
import {
    BackButton,
    Button,
    EmptyState,
    Input,
    Modal,
    PageHeader,
    Spinner,
    Table,
    TableContainer,
    TBody,
    TD,
    TH,
    THead,
    TR,
    useToast,
} from '@/components/ui';
import {
    AccommodationStudent,
    ImportResult,
    useAccommodationsStore,
} from '@/stores/useAccommodationsStore';
import AccommodationEditDrawer from '@/components/admin/AccommodationEditDrawer';

export default function AccommodationsAdminPage() {
    const { students, total, isLoading, search, setSearch, fetchStudents, importCsv } =
        useAccommodationsStore();
    const { toast } = useToast();

    const [selected, setSelected] = useState<AccommodationStudent | null>(null);
    const [importOpen, setImportOpen] = useState(false);

    useEffect(() => {
        void fetchStudents({ skip: 0 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void fetchStudents({ skip: 0, search });
    };

    return (
        <ProtectedRoute allowedRoles={['ADMIN']}>
            <PageShell width="wide">
                <div className="space-y-6">
                    <BackButton href="/" label="Back" />
                    <div className="flex items-end justify-between gap-4 flex-wrap">
                        <PageHeader
                            title="Accommodations"
                            subtitle="Set extra-time and display provisions for students."
                        />
                        <Button variant="secondary" onClick={() => setImportOpen(true)}>
                            Import CSV
                        </Button>
                    </div>

                    <form onSubmit={onSearchSubmit} className="flex gap-2 max-w-md">
                        <Input
                            placeholder="Search by email or VUnetID"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            aria-label="Search students"
                        />
                        <Button type="submit" variant="secondary">Search</Button>
                    </form>

                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <Spinner size="md" tone="brand" />
                        </div>
                    ) : students.length === 0 ? (
                        <EmptyState
                            title="No students found"
                            description="Adjust your search, or import a provisions CSV to get started."
                        />
                    ) : (
                        <TableContainer>
                            <Table>
                                <THead>
                                    <TR>
                                        <TH>Student</TH>
                                        <TH>VUnetID</TH>
                                        <TH align="right">Extra time</TH>
                                        <TH align="center">Enlarged</TH>
                                        <TH align="right"></TH>
                                    </TR>
                                </THead>
                                <TBody>
                                    {students.map((s) => (
                                        <TR key={s.id}>
                                            <TD>{s.email}</TD>
                                            <TD>{s.vunet_id || '—'}</TD>
                                            <TD align="right">
                                                {s.provision_time_multiplier === 1
                                                    ? 'Standard'
                                                    : `${s.provision_time_multiplier}×`}
                                            </TD>
                                            <TD align="center">{s.accommodation_enlarged_display ? 'Yes' : '—'}</TD>
                                            <TD align="right">
                                                <Button variant="ghost" size="sm" onClick={() => setSelected(s)}>
                                                    Edit
                                                </Button>
                                            </TD>
                                        </TR>
                                    ))}
                                </TBody>
                            </Table>
                        </TableContainer>
                    )}

                    <p className="text-meta text-shell-muted-dim">
                        {total} student{total === 1 ? '' : 's'} · sorted by email
                    </p>
                </div>

                <AccommodationEditDrawer student={selected} onClose={() => setSelected(null)} />
                <ImportModal
                    isOpen={importOpen}
                    onClose={() => setImportOpen(false)}
                    onImport={importCsv}
                    onDone={(result) =>
                        toast({
                            tone: result.errors > 0 ? 'warning' : 'success',
                            title: 'Import complete',
                            description: `${result.applied} applied, ${result.unchanged} unchanged, ${result.errors} errors.`,
                        })
                    }
                />
            </PageShell>
        </ProtectedRoute>
    );
}

function ImportModal({
    isOpen,
    onClose,
    onImport,
    onDone,
}: {
    isOpen: boolean;
    onClose: () => void;
    onImport: (file: File) => Promise<ImportResult>;
    onDone: (result: ImportResult) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const run = async () => {
        const file = inputRef.current?.files?.[0];
        if (!file) {
            setError('Choose a CSV file first.');
            return;
        }
        setError(null);
        setBusy(true);
        try {
            const res = await onImport(file);
            setResult(res);
            onDone(res);
        } catch {
            setError('Import failed. Check the file format and try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Import accommodations" size="md">
            <div className="space-y-4">
                <p className="text-meta text-shell-muted">
                    CSV columns: <code>vunet_id, provision_time_multiplier, enlarged_display</code>.
                </p>
                <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,text/csv"
                    aria-label="Provisions CSV file"
                    className="block w-full text-meta text-foreground file:mr-3 file:rounded-md file:border file:border-shell-border file:bg-shell-surface file:px-3 file:py-1.5 file:text-foreground"
                />
                {error && <p className="text-meta text-[var(--color-danger-fg)]">{error}</p>}

                {result && (
                    <div className="rounded-xl border border-shell-border bg-shell-input px-4 py-3 space-y-2 max-h-60 overflow-y-auto">
                        <p className="text-meta text-foreground">
                            {result.applied} applied · {result.unchanged} unchanged · {result.errors} errors
                        </p>
                        {result.rows
                            .filter((r) => r.status === 'error')
                            .map((r) => (
                                <p key={r.row} className="text-eyebrow text-[var(--color-danger-fg)]">
                                    Row {r.row} ({r.vunet_id || 'no VUnetID'}): {r.message}
                                </p>
                            ))}
                    </div>
                )}

                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} disabled={busy}>
                        Close
                    </Button>
                    <Button variant="primary" onClick={run} loading={busy}>
                        Import
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

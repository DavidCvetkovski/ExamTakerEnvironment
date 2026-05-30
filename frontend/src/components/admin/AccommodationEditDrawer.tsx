'use client';

import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';

import { Button, Drawer, Field, Input, Spinner, useToast } from '@/components/ui';
import { formatAbsolute } from '@/lib/relativeTime';
import {
    AccommodationStudent,
    useAccommodationsStore,
} from '@/stores/useAccommodationsStore';

const FIELD_LABEL: Record<string, string> = {
    provision_time_multiplier: 'Extra time',
    accommodation_enlarged_display: 'Enlarged display',
};

interface Props {
    student: AccommodationStudent | null;
    onClose: () => void;
}

/** Edit a single student's provisions + view their audit timeline. */
export default function AccommodationEditDrawer({ student, onClose }: Props) {
    const { updateStudent, fetchAudit, audit, auditLoading } = useAccommodationsStore();
    const { toast } = useToast();

    const [multiplier, setMultiplier] = useState('1');
    const [enlarged, setEnlarged] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const isOpen = student !== null;

    // Seed the form + load the audit history whenever a student is opened.
    useEffect(() => {
        if (student) {
            setMultiplier(String(student.provision_time_multiplier));
            setEnlarged(student.accommodation_enlarged_display);
            setError(null);
            void fetchAudit(student.id);
        }
    }, [student, fetchAudit]);

    const save = async () => {
        if (!student) return;
        const parsed = Number(multiplier);
        if (Number.isNaN(parsed) || parsed < 1 || parsed > 3) {
            setError('Multiplier must be between 1.0 and 3.0.');
            return;
        }
        setError(null);
        setSaving(true);
        try {
            await updateStudent(student.id, {
                provision_time_multiplier: parsed,
                enlarged_display: enlarged,
            });
            await fetchAudit(student.id);
            toast({ tone: 'success', title: 'Accommodation updated', description: 'Changes are recorded in the audit log.' });
        } catch (err) {
            const axiosErr = err as AxiosError<{ detail?: string }>;
            setError(axiosErr.response?.data?.detail ?? 'Could not save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Drawer isOpen={isOpen} onClose={onClose} title="Edit accommodation">
            {student && (
                <div className="space-y-6">
                    <div>
                        <p className="text-body font-medium text-foreground truncate">{student.email}</p>
                        <p className="text-meta text-shell-muted-dim">{student.vunet_id || 'No VUnetID'}</p>
                    </div>

                    <Field
                        label="Extra-time multiplier"
                        htmlFor="multiplier"
                        hint="1.0 = standard time. 1.5 gives 90 min for a 60 min exam."
                        error={error ?? undefined}
                    >
                        <Input
                            id="multiplier"
                            type="number"
                            min={1}
                            max={3}
                            step={0.05}
                            value={multiplier}
                            onChange={(e) => setMultiplier(e.target.value)}
                            invalid={!!error}
                        />
                    </Field>

                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-body font-medium text-foreground">Enlarged display</p>
                            <p className="text-meta text-shell-muted-dim">Forces a larger layout during exams.</p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={enlarged}
                            aria-label="Enlarged display"
                            onClick={() => setEnlarged((v) => !v)}
                            className={[
                                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
                                'focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-shell-surface',
                                enlarged ? 'bg-brand border-brand' : 'bg-shell-input border-shell-border-deep',
                            ].join(' ')}
                        >
                            <span
                                className={[
                                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                                    enlarged ? 'translate-x-6' : 'translate-x-1',
                                ].join(' ')}
                            />
                        </button>
                    </div>

                    <div className="flex justify-end">
                        <Button variant="primary" onClick={save} loading={saving}>
                            Save changes
                        </Button>
                    </div>

                    <div className="border-t border-shell-border pt-5">
                        <h3 className="text-meta font-semibold text-shell-muted mb-3">Audit history</h3>
                        {auditLoading ? (
                            <Spinner size="sm" tone="brand" />
                        ) : audit.length === 0 ? (
                            <p className="text-meta text-shell-muted-dim">No changes recorded yet.</p>
                        ) : (
                            <ul className="space-y-3">
                                {audit.map((entry) => (
                                    <li key={entry.id} className="text-meta">
                                        <p className="text-foreground">
                                            {FIELD_LABEL[entry.field] ?? entry.field}: {entry.old_value} → {entry.new_value}
                                        </p>
                                        <p className="text-eyebrow text-shell-muted-dim">
                                            {formatAbsolute(entry.created_at, { withSeconds: true })} · {entry.source === 'csv_import' ? 'CSV import' : 'Manual'}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </Drawer>
    );
}

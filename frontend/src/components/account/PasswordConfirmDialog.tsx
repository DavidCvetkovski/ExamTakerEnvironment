'use client';

import { useState } from 'react';
import { AxiosError } from 'axios';

import { Button, Field, Input, Modal } from '@/components/ui';

interface PasswordConfirmDialogProps {
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    tone?: 'primary' | 'destructive';
    onCancel: () => void;
    /** Runs the password-gated action; reject to surface an inline error. */
    onConfirm: (password: string) => Promise<void>;
}

/** Inner form. Mounted by Modal only while open, so its transient state (the
 *  entered password, any error) resets on every open without a reset effect. */
function ConfirmForm({
    description,
    confirmLabel,
    tone,
    onCancel,
    onConfirm,
}: Omit<PasswordConfirmDialogProps, 'isOpen' | 'title'>) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password || submitting) return;
        setError(null);
        setSubmitting(true);
        try {
            await onConfirm(password);
        } catch (err) {
            const axiosErr = err as AxiosError<{ detail?: string }>;
            setError(axiosErr.response?.data?.detail ?? 'Something went wrong. Please try again.');
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <p className="text-meta text-shell-muted">{description}</p>
            <Field label="Confirm your password" htmlFor="confirm-action-password" error={error ?? undefined}>
                <Input
                    id="confirm-action-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    invalid={!!error}
                    autoFocus
                />
            </Field>
            <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
                    Cancel
                </Button>
                <Button type="submit" variant={tone ?? 'primary'} disabled={!password} loading={submitting}>
                    {confirmLabel}
                </Button>
            </div>
        </form>
    );
}

/** Re-authentication gate for destructive self-service actions (sign out
 *  everywhere, deactivate). The backend re-verifies the password regardless —
 *  this is the UX layer, not the security boundary (CLAUDE.md §1). */
export default function PasswordConfirmDialog({ isOpen, title, ...rest }: PasswordConfirmDialogProps) {
    return (
        <Modal isOpen={isOpen} onClose={rest.onCancel} title={title} size="sm" blockBackdropClose>
            <ConfirmForm {...rest} />
        </Modal>
    );
}

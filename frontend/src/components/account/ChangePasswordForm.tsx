'use client';

import { useState } from 'react';
import { AxiosError } from 'axios';

import { Button, Field, Input, useToast } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';

const MIN_LENGTH = 8;

/** Monochrome eye / eye-off icons for the show-hide toggle (SVG, not glyphs —
 *  CLAUDE.md §7.2). */
function EyeIcon({ off }: { off?: boolean }) {
    return (
        <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z" />
            <circle cx="8" cy="8" r="2" />
            {off && <path strokeLinecap="round" d="M2 2l12 12" />}
        </svg>
    );
}

function PasswordInput({
    id,
    value,
    onChange,
    autoComplete,
    invalid,
}: {
    id: string;
    value: string;
    onChange: (v: string) => void;
    autoComplete: string;
    invalid?: boolean;
}) {
    const [shown, setShown] = useState(false);
    return (
        <div className="relative">
            <Input
                id={id}
                type={shown ? 'text' : 'password'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                autoComplete={autoComplete}
                invalid={invalid}
                className="pr-10"
            />
            <button
                type="button"
                onClick={() => setShown((s) => !s)}
                aria-label={shown ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-shell-muted-dim hover:text-foreground"
            >
                <EyeIcon off={shown} />
            </button>
        </div>
    );
}

/** Change-password form. Client-side checks are advisory (CLAUDE.md §1 — the
 *  backend 400/422 is authoritative); they only gate the submit button. */
export default function ChangePasswordForm() {
    const { changePassword } = useAuthStore();
    const { toast } = useToast();

    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const tooShort = next.length > 0 && next.length < MIN_LENGTH;
    const mismatch = confirm.length > 0 && next !== confirm;
    const sameAsCurrent = next.length > 0 && next === current;
    const canSubmit =
        current.length > 0 &&
        next.length >= MIN_LENGTH &&
        next === confirm &&
        !sameAsCurrent &&
        !submitting;

    const reset = () => {
        setCurrent('');
        setNext('');
        setConfirm('');
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setError(null);
        setSubmitting(true);
        try {
            await changePassword(current, next);
            toast({
                tone: 'success',
                title: 'Password changed',
                description: 'Other devices have been signed out.',
            });
            reset();
        } catch (err) {
            const axiosErr = err as AxiosError<{ detail?: string }>;
            setError(axiosErr.response?.data?.detail ?? 'Could not change password. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <Field label="Current password" htmlFor="current-password" error={error ?? undefined}>
                <PasswordInput
                    id="current-password"
                    value={current}
                    onChange={setCurrent}
                    autoComplete="current-password"
                    invalid={!!error}
                />
            </Field>

            <Field
                label="New password"
                htmlFor="new-password"
                hint={`At least ${MIN_LENGTH} characters.`}
                error={
                    tooShort
                        ? `Use at least ${MIN_LENGTH} characters.`
                        : sameAsCurrent
                          ? 'New password must be different.'
                          : undefined
                }
            >
                <PasswordInput
                    id="new-password"
                    value={next}
                    onChange={setNext}
                    autoComplete="new-password"
                    invalid={tooShort || sameAsCurrent}
                />
            </Field>

            <Field
                label="Confirm new password"
                htmlFor="confirm-password"
                error={mismatch ? 'Passwords do not match.' : undefined}
            >
                <PasswordInput
                    id="confirm-password"
                    value={confirm}
                    onChange={setConfirm}
                    autoComplete="new-password"
                    invalid={mismatch}
                />
            </Field>

            <Button type="submit" variant="primary" disabled={!canSubmit} loading={submitting}>
                Change password
            </Button>
        </form>
    );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';
import PasswordConfirmDialog from './PasswordConfirmDialog';

/** Self-deactivation. Reversible by an administrator (never a hard delete);
 *  gated behind a password-confirm dialog. Admins are blocked server-side. */
export default function DangerZone() {
    const { deactivateAccount } = useAuthStore();
    const router = useRouter();
    const [dialogOpen, setDialogOpen] = useState(false);

    const confirmDeactivate = async (password: string) => {
        await deactivateAccount(password);
        setDialogOpen(false);
        router.replace('/login');
    };

    return (
        <section className="rounded-2xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-6 py-5 space-y-4">
            <div>
                <h2 className="text-h3 font-semibold text-[var(--color-danger-fg)]">Danger zone</h2>
                <p className="text-meta text-shell-muted">
                    Deactivating signs you out and blocks login until an administrator restores your account. Your
                    authored content and results are preserved.
                </p>
            </div>

            <Button variant="destructive" onClick={() => setDialogOpen(true)}>
                Deactivate account
            </Button>

            <PasswordConfirmDialog
                isOpen={dialogOpen}
                title="Deactivate your account?"
                description="You'll be signed out and won't be able to log in until an administrator reactivates you. This can be undone by an admin."
                confirmLabel="Yes, deactivate"
                tone="destructive"
                onCancel={() => setDialogOpen(false)}
                onConfirm={confirmDeactivate}
            />
        </section>
    );
}

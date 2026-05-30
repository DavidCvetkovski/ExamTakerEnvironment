'use client';

import { useState } from 'react';

import { Button, useToast } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';
import ChangePasswordForm from './ChangePasswordForm';
import PasswordConfirmDialog from './PasswordConfirmDialog';

/** Security controls: change password + sign out of all other devices. */
export default function SecuritySection() {
    const { logoutEverywhere } = useAuthStore();
    const { toast } = useToast();
    const [dialogOpen, setDialogOpen] = useState(false);

    const confirmSignOutAll = async (password: string) => {
        await logoutEverywhere(password);
        setDialogOpen(false);
        toast({
            tone: 'success',
            title: 'Signed out everywhere',
            description: 'All other devices have been signed out.',
        });
    };

    return (
        <section className="rounded-2xl border border-shell-border bg-shell-surface px-6 py-5 space-y-6">
            <div>
                <h2 className="text-h3 font-semibold text-foreground">Security</h2>
                <p className="text-meta text-shell-muted-dim">Change your password and manage active sessions.</p>
            </div>

            <ChangePasswordForm />

            <div className="border-t border-shell-border pt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-body font-medium text-foreground">Sign out of all other devices</p>
                    <p className="text-meta text-shell-muted-dim">
                        Ends every session except this one. Useful if you used a shared computer.
                    </p>
                </div>
                <Button variant="secondary" onClick={() => setDialogOpen(true)}>
                    Sign out everywhere
                </Button>
            </div>

            <PasswordConfirmDialog
                isOpen={dialogOpen}
                title="Sign out of all other devices?"
                description="Every other signed-in device will need to log in again. This session stays active."
                confirmLabel="Sign out everywhere"
                onCancel={() => setDialogOpen(false)}
                onConfirm={confirmSignOutAll}
            />
        </section>
    );
}

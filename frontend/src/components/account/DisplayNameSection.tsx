'use client';

import { useState } from 'react';

import { Button, Input, Field, useToast } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';

const MAX_LENGTH = 80;

/** Self-service display name (Epoch 14.5). This is the name the home dashboard
 *  greets the user with; when empty we fall back to the email local-part.
 *  Distinct from the administrator-managed identity in `ProfileCard`. */
export default function DisplayNameSection() {
    const { user, setDisplayName } = useAuthStore();
    const { toast } = useToast();
    const [value, setValue] = useState(user?.display_name ?? '');
    const [saving, setSaving] = useState(false);

    const emailLocalPart = user?.email?.split('@')[0] ?? 'there';
    const current = user?.display_name ?? '';
    const isDirty = value.trim() !== current;

    const save = async () => {
        setSaving(true);
        try {
            await setDisplayName(value.trim() || null);
            toast({ tone: 'success', title: 'Display name saved' });
        } catch {
            toast({ tone: 'danger', title: 'Could not save name', description: 'Please try again.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="rounded-2xl border border-shell-border bg-shell-surface px-6 py-5 space-y-4">
            <div>
                <h2 className="text-h3 font-semibold text-foreground">Display name</h2>
                <p className="text-meta text-shell-muted-dim">
                    How OpenVision greets you on the home screen. Leave blank to use “{emailLocalPart}”.
                </p>
            </div>

            <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (isDirty && !saving) void save();
                }}
            >
                <div className="flex-1">
                    <Field label="Your name" htmlFor="display-name">
                        <Input
                            id="display-name"
                            inputSize="md"
                            value={value}
                            maxLength={MAX_LENGTH}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder={emailLocalPart}
                        />
                    </Field>
                </div>
                <Button type="submit" variant="primary" size="md" disabled={!isDirty || saving} loading={saving}>
                    Save
                </Button>
            </form>
        </section>
    );
}

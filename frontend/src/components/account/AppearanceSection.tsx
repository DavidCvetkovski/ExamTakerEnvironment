'use client';

import { useState } from 'react';

import { useToast } from '@/components/ui';
import { ThemePreference, useAuthStore, UserPublic } from '@/stores/useAuthStore';

const THEMES: Array<{ label: string; value: ThemePreference; hint: string }> = [
    { label: 'Auto', value: 'auto', hint: 'Follows time of day' },
    { label: 'Dark', value: 'dark', hint: 'Default' },
    { label: 'Warm', value: 'warm', hint: 'Softer, low-contrast' },
    { label: 'Light blue', value: 'light-blue', hint: 'Bright' },
];

function roleDefaultTheme(role: UserPublic['role'] | undefined): ThemePreference {
    return role === 'STUDENT' ? 'warm' : 'dark';
}

/** Theme picker on the account page. Reuses the existing, fully-wired
 *  `setThemePreference` plumbing (optimistic + persisted) — no new endpoint. */
export default function AppearanceSection() {
    const { user, themePreference, setThemePreference } = useAuthStore();
    const { toast } = useToast();
    const [saving, setSaving] = useState<ThemePreference | null>(null);

    const active = themePreference ?? roleDefaultTheme(user?.role);

    const choose = async (value: ThemePreference) => {
        if (value === active) return;
        setSaving(value);
        try {
            await setThemePreference(value);
        } catch {
            toast({ tone: 'danger', title: 'Could not save theme', description: 'Please try again.' });
        } finally {
            setSaving(null);
        }
    };

    return (
        <section className="rounded-2xl border border-shell-border bg-shell-surface px-6 py-5 space-y-4">
            <div>
                <h2 className="text-h3 font-semibold text-foreground">Appearance</h2>
                <p className="text-meta text-shell-muted-dim">Choose how OpenVision looks. Saved to your account.</p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {THEMES.map((theme) => {
                    const isActive = active === theme.value;
                    return (
                        <button
                            key={theme.value}
                            type="button"
                            disabled={saving !== null}
                            aria-pressed={isActive}
                            onClick={() => choose(theme.value)}
                            className={[
                                'flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                                'disabled:opacity-60 disabled:cursor-not-allowed',
                                isActive
                                    ? 'border-brand bg-brand/10 text-foreground'
                                    : 'border-shell-border bg-shell-input text-foreground hover:border-shell-border-deep',
                            ].join(' ')}
                        >
                            <span className="text-body font-medium">{theme.label}</span>
                            <span className="text-eyebrow text-shell-muted-dim">{theme.hint}</span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

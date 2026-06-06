'use client';

import { useState } from 'react';

import { useToast } from '@/components/ui';
import { AccessibilityPatch, TextScale, useAuthStore } from '@/stores/useAuthStore';

const SCALES: Array<{ label: string; value: TextScale; hint: string }> = [
    { label: 'Default', value: 'md', hint: '100%' },
    { label: 'Large', value: 'lg', hint: '115%' },
    { label: 'Extra large', value: 'xl', hint: '130%' },
];

/** Self-service visual accessibility profile — orthogonal to the colour theme.
 *  Writes through the shared `setAccessibilityPreference` (optimistic + rollback,
 *  same pattern as theme). The actual rendering is applied by ThemeProvider via
 *  data-a11y-* attributes; this is purely the control surface. */
export default function AccessibilitySection() {
    const { accessibility, setAccessibilityPreference } = useAuthStore();
    const { toast } = useToast();
    const [busy, setBusy] = useState(false);

    const apply = async (patch: AccessibilityPatch) => {
        setBusy(true);
        try {
            await setAccessibilityPreference(patch);
        } catch {
            toast({ tone: 'danger', title: 'Could not save', description: 'Please try again.' });
        } finally {
            setBusy(false);
        }
    };

    const activeScale: TextScale = accessibility.text_scale ?? 'md';

    return (
        <section className="rounded-2xl border border-shell-border bg-shell-surface px-6 py-5 space-y-5">
            <div>
                <h2 className="text-h3 font-semibold text-foreground">Accessibility</h2>
                <p className="text-meta text-shell-muted-dim">
                    Adjust contrast, font, and text size. Saved to your account and applied everywhere.
                </p>
            </div>

            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="text-body font-medium text-foreground">High contrast</p>
                    <p className="text-meta text-shell-muted-dim">Maximises contrast for low-vision readability.</p>
                </div>
                <Toggle
                    checked={accessibility.high_contrast}
                    disabled={busy}
                    label="High contrast"
                    onChange={(v) => apply({ high_contrast: v })}
                />
            </div>

            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="text-body font-medium text-foreground">Dyslexia-friendly font</p>
                    <p className="text-meta text-shell-muted-dim">Distinct letterforms with wider spacing.</p>
                </div>
                <Toggle
                    checked={accessibility.dyslexia_font}
                    disabled={busy}
                    label="Dyslexia-friendly font"
                    onChange={(v) => apply({ dyslexia_font: v })}
                />
            </div>

            <div className="space-y-2">
                <p className="text-body font-medium text-foreground">Text size</p>
                <div className="grid grid-cols-3 gap-3" role="group" aria-label="Text size">
                    {SCALES.map((scale) => {
                        const isActive = activeScale === scale.value;
                        const isHighContrast = accessibility.high_contrast;
                        return (
                            <button
                                key={scale.value}
                                type="button"
                                disabled={busy}
                                aria-pressed={isActive}
                                onClick={() => apply({ text_scale: scale.value === 'md' ? 'default' : scale.value })}
                                className={[
                                    'flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                                    'disabled:opacity-60 disabled:cursor-not-allowed',
                                    isActive
                                        ? isHighContrast
                                            ? 'bg-foreground text-background border-foreground font-semibold'
                                            : 'border-brand bg-brand/10 text-foreground font-semibold'
                                        : isHighContrast
                                            ? 'border-shell-border bg-shell-input text-foreground hover:bg-foreground hover:text-background'
                                            : 'border-shell-border bg-shell-input text-foreground hover:border-shell-border-deep hover:bg-shell-border/20',
                                ].join(' ')}
                            >
                                <span className="text-body font-medium">{scale.label}</span>
                                <span className={`text-eyebrow ${isActive ? 'text-inherit opacity-80' : 'text-shell-muted-dim'}`}>{scale.hint}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

/** Accessible on/off switch (token-styled, keyboard-operable via the native
 *  checkbox it wraps). */
function Toggle({
    checked,
    disabled,
    label,
    onChange,
}: {
    checked: boolean;
    disabled?: boolean;
    label: string;
    onChange: (value: boolean) => void;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={[
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                'focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-shell-surface',
                checked ? 'bg-brand border-brand' : 'bg-shell-input border-shell-border-deep',
            ].join(' ')}
        >
            <span
                className={[
                    'inline-block h-4 w-4 transform rounded-full transition-all duration-200 transition-transform',
                    checked ? 'bg-shell-surface translate-x-6' : 'bg-shell-muted-dim translate-x-1',
                ].join(' ')}
            />
        </button>
    );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore, ThemePreference, AccessibilityPatch, TextScale } from '@/stores/useAuthStore';
import { useClickOutside } from '@/hooks/useClickOutside';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/useToast';

const THEMES: Array<{ label: string; value: ThemePreference }> = [
    { label: 'Auto', value: 'auto' },
    { label: 'Dark', value: 'dark' },
    { label: 'Warm', value: 'warm' },
    { label: 'Cool blue', value: 'light-blue' },
];

const SCALES: Array<{ label: string; value: TextScale; hint: string }> = [
    { label: 'Default', value: 'md', hint: '100%' },
    { label: 'Large', value: 'lg', hint: '115%' },
    { label: 'Extra large', value: 'xl', hint: '130%' },
];

export default function A11yQuickAdjust() {
    const { user, themePreference, setThemePreference, accessibility, setAccessibilityPreference } = useAuthStore();
    const [isOpen, setIsOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();

    const isHighContrast = accessibility.high_contrast;

    // Close on click outside or Escape key
    useClickOutside(popoverRef, () => setIsOpen(false));

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    const activeTheme = themePreference ?? (user?.role === 'STUDENT' ? 'warm' : 'dark');

    const handleThemeChange = async (theme: ThemePreference) => {
        if (theme === activeTheme) return;
        setBusy(true);
        try {
            await setThemePreference(theme);
        } catch {
            toast({ tone: 'danger', title: 'Could not save theme', description: 'Please try again.' });
        } finally {
            setBusy(false);
        }
    };

    const handleA11yChange = async (patch: AccessibilityPatch) => {
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
        <div ref={popoverRef} className="relative">
            <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsOpen((open) => !open)}
                aria-label="Appearance and Accessibility settings"
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                className="flex items-center gap-1.5 focus:outline-none"
            >
                {/* Visual Settings Icon */}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Display Options
            </Button>

            {isOpen && (
                <div 
                    className="absolute right-0 top-12 z-30 w-72 rounded-2xl border border-shell-border bg-shell-surface p-5 shadow-elevated backdrop-blur space-y-4"
                    role="dialog"
                    aria-label="Display Options Menu"
                >
                    <h2 className="text-body font-semibold text-foreground border-b border-shell-border pb-2">
                        Display & Accessibility
                    </h2>

                    {/* Theme section */}
                    <div className="space-y-1.5">
                        <label className="text-eyebrow text-shell-muted-dim block">Theme</label>
                        <div className="grid grid-cols-2 gap-1.5">
                            {THEMES.map((theme) => {
                                const isActive = activeTheme === theme.value;
                                return (
                                    <button
                                        key={theme.value}
                                        type="button"
                                        disabled={busy}
                                        onClick={() => handleThemeChange(theme.value)}
                                        className={[
                                            'rounded-lg px-2.5 py-1.5 text-center text-xs transition-colors font-medium border',
                                            busy ? 'opacity-60 cursor-not-allowed' : '',
                                            isActive
                                                ? isHighContrast
                                                    ? 'bg-foreground text-background border-foreground font-semibold'
                                                    : 'border-brand bg-brand/10 text-foreground font-semibold'
                                                : isHighContrast
                                                    ? 'border-shell-border bg-shell-input text-foreground hover:bg-foreground hover:text-background'
                                                    : 'border-shell-border bg-shell-input text-foreground hover:border-shell-border-deep hover:bg-shell-border/20',
                                        ].join(' ')}
                                    >
                                        {theme.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Text Size section */}
                    <div className="space-y-1.5">
                        <label className="text-eyebrow text-shell-muted-dim block">Text size</label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {SCALES.map((scale) => {
                                const isActive = activeScale === scale.value;
                                return (
                                    <button
                                        key={scale.value}
                                        type="button"
                                        disabled={busy}
                                        onClick={() => handleA11yChange({ text_scale: scale.value === 'md' ? 'default' : scale.value })}
                                        className={[
                                            'flex flex-col items-center justify-center rounded-lg px-2 py-1.5 text-center transition-colors border',
                                            busy ? 'opacity-60 cursor-not-allowed' : '',
                                            isActive
                                                ? isHighContrast
                                                    ? 'bg-foreground text-background border-foreground font-semibold'
                                                    : 'border-brand bg-brand/10 text-foreground font-semibold'
                                                : isHighContrast
                                                    ? 'border-shell-border bg-shell-input text-foreground hover:bg-foreground hover:text-background'
                                                    : 'border-shell-border bg-shell-input text-foreground hover:border-shell-border-deep hover:bg-shell-border/20',
                                        ].join(' ')}
                                    >
                                        <span className="text-xs font-medium">{scale.label}</span>
                                        <span className={`text-[10px] ${isActive ? 'text-inherit opacity-85 font-medium' : 'text-shell-muted-dim'}`}>{scale.hint}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Toggles section */}
                    <div className="space-y-3 pt-2 border-t border-shell-border">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-foreground">High contrast</p>
                                <p className="text-[10px] text-shell-muted-dim">Maximise visual contrast</p>
                            </div>
                            <Toggle
                                checked={accessibility.high_contrast}
                                disabled={busy}
                                label="High contrast"
                                onChange={(v) => handleA11yChange({ high_contrast: v })}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-foreground">Dyslexia font</p>
                                <p className="text-[10px] text-shell-muted-dim">Highly legible letterforms</p>
                            </div>
                            <Toggle
                                checked={accessibility.dyslexia_font}
                                disabled={busy}
                                label="Dyslexia font"
                                onChange={(v) => handleA11yChange({ dyslexia_font: v })}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

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
                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                'focus:outline-none focus:ring-1 focus:ring-brand focus:ring-offset-1 focus:ring-offset-shell-surface',
                checked ? 'bg-brand border-brand' : 'bg-shell-input border-shell-border-deep',
            ].join(' ')}
        >
            <span
                className={[
                    'inline-block h-3.5 w-3.5 transform rounded-full transition-all duration-200 transition-transform',
                    checked ? 'bg-shell-surface translate-x-5' : 'bg-shell-muted-dim translate-x-0.5',
                ].join(' ')}
            />
        </button>
    );
}

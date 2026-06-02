'use client';

import { useState } from 'react';
import {
    DEFAULT_PROCTORING_CONFIG,
    type ProctoringConfig,
} from '@/stores/useBlueprintStore';

interface ProctoringConfigPanelProps {
    value: ProctoringConfig | undefined;
    onChange: (next: ProctoringConfig) => void;
}

interface ToggleRowProps {
    label: string;
    description: string;
    checked: boolean;
    onToggle: () => void;
}

function ToggleRow({ label, description, checked, onToggle }: ToggleRowProps) {
    return (
        <div className="flex items-start justify-between gap-4 py-2">
            <div>
                <p className="text-sm font-semibold text-shell-muted">{label}</p>
                <p className="text-meta text-shell-muted-dim">{description}</p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                onClick={onToggle}
                className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-ring ${
                    checked ? 'bg-brand' : 'bg-shell-input-alt'
                }`}
            >
                <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-shell-bg transition-transform ${
                        checked ? 'translate-x-6' : 'translate-x-1'
                    }`}
                />
            </button>
        </div>
    );
}

/**
 * Security & Proctoring editor panel (Epoch 11 §10.2).
 *
 * Pure controlled component: it renders the policy and emits the next policy via
 * onChange. All values are advisory UX — the backend enforces SEB integrity, IP
 * allow-listing, and ownership regardless of what the client sends.
 */
export default function ProctoringConfigPanel({ value, onChange }: ProctoringConfigPanelProps) {
    const config = value ?? DEFAULT_PROCTORING_CONFIG;
    const [open, setOpen] = useState(false);

    const patch = (next: Partial<ProctoringConfig>) => onChange({ ...config, ...next });

    return (
        <div className="rounded-xl border border-shell-border bg-shell-input/30 p-4">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-3 text-left focus-ring rounded-md"
                aria-expanded={open}
            >
                <span className="text-sm font-semibold text-foreground">Security &amp; Proctoring</span>
                {config.require_seb && (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-eyebrow font-semibold text-brand">
                        SEB required
                    </span>
                )}
                <span className="ml-auto text-meta text-shell-muted-dim">{open ? 'Hide' : 'Show'}</span>
            </button>

            {open && (
                <div className="mt-4 space-y-1 divide-y divide-shell-border">
                    <ToggleRow
                        label="Require Safe Exam Browser"
                        description="Reject any attempt that is not made through Safe Exam Browser."
                        checked={config.require_seb}
                        onToggle={() => patch({ require_seb: !config.require_seb })}
                    />
                    <ToggleRow
                        label="Block copy & paste"
                        description="Prevent copying the question text (answer fields stay usable)."
                        checked={config.block_copy_paste}
                        onToggle={() => patch({ block_copy_paste: !config.block_copy_paste })}
                    />
                    <ToggleRow
                        label="Suppress right-click menu"
                        description="Disable the browser context menu during the exam."
                        checked={config.suppress_context_menu}
                        onToggle={() => patch({ suppress_context_menu: !config.suppress_context_menu })}
                    />
                    <ToggleRow
                        label="Require fullscreen"
                        description="Prompt the student to stay in fullscreen and log exits."
                        checked={config.require_fullscreen}
                        onToggle={() => patch({ require_fullscreen: !config.require_fullscreen })}
                    />
                    <ToggleRow
                        label="Detect tab switching"
                        description="Log an incident when the student leaves the exam tab."
                        checked={config.detect_focus_loss}
                        onToggle={() => patch({ detect_focus_loss: !config.detect_focus_loss })}
                    />
                    <ToggleRow
                        label="Detect device sharing"
                        description="Flag an attempt driven from more than one device."
                        checked={config.detect_session_sharing}
                        onToggle={() => patch({ detect_session_sharing: !config.detect_session_sharing })}
                    />

                    <div className="py-3">
                        <label
                            htmlFor="ip-allowlist"
                            className="block text-sm font-semibold text-shell-muted"
                        >
                            IP allow-list
                        </label>
                        <p className="text-meta text-shell-muted-dim">
                            One CIDR per line (e.g. <code>145.108.0.0/16</code>). Leave empty for no
                            network restriction.
                        </p>
                        <textarea
                            id="ip-allowlist"
                            value={config.ip_allowlist.join('\n')}
                            onChange={(e) =>
                                patch({
                                    ip_allowlist: e.target.value
                                        .split('\n')
                                        .map((line) => line.trim())
                                        .filter(Boolean),
                                })
                            }
                            rows={3}
                            spellCheck={false}
                            className="mt-2 w-full rounded-xl border border-shell-border bg-shell-input px-3 py-2 font-mono text-sm text-foreground focus:border-brand focus:outline-none"
                            placeholder="145.108.0.0/16"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

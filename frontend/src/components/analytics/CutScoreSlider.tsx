'use client';

import type { CutScoreScenario } from '@/lib/analytics.types';

interface CutScoreSliderProps {
    value: number;
    baselineCut: number | null;
    scenario?: CutScoreScenario;
    onChange: (value: number) => void;
}

export default function CutScoreSlider({
    value,
    baselineCut,
    scenario,
    onChange,
}: CutScoreSliderProps) {
    return (
        <div className="rounded-xl border border-shell-border bg-shell-surface px-5 py-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-semibold text-foreground">Cut-Score What-If</p>
                    <p className="mt-1 text-xs text-shell-muted-dim">
                        Compare the pass split against a different threshold without changing the stored test settings.
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-3xl font-bold tabular-nums" style={{ color: 'var(--color-brand)' }}>
                        {Math.round(value)}%
                    </p>
                    <p className="text-xs text-shell-muted-dim">
                        Baseline {baselineCut !== null ? `${baselineCut}%` : 'not set'}
                    </p>
                </div>
            </div>

            <div className="mt-5">
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={0.1}
                    value={value}
                    onChange={(event) => onChange(Number(event.target.value))}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(value)}
                    aria-valuetext={`${Math.round(value)}%`}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full"
                    style={{
                        background: `linear-gradient(to right, var(--color-brand) 0%, var(--color-brand) ${value}%, var(--color-shell-input-alt) ${value}%, var(--color-shell-input-alt) 100%)`,
                        accentColor: 'var(--color-brand)',
                    }}
                />
                <div className="mt-2 flex justify-between text-eyebrow text-shell-muted-dim">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-shell-border bg-shell-bg/70 px-4 py-3">
                    <p className="text-eyebrow uppercase tracking-eyebrow text-shell-muted-dim">Pass Rate</p>
                    <p className="mt-2 text-xl font-semibold tabular-nums" style={{ color: 'var(--color-success-fg)' }}>
                        {scenario ? `${scenario.pass_rate.toFixed(1)}%` : '...'}
                    </p>
                </div>
                <div className="rounded-lg border border-shell-border bg-shell-bg/70 px-4 py-3">
                    <p className="text-eyebrow uppercase tracking-eyebrow text-shell-muted-dim">Passing</p>
                    <p className="mt-2 text-xl font-semibold tabular-nums" style={{ color: 'var(--color-info-fg)' }}>
                        {scenario ? scenario.pass_count : '...'}
                    </p>
                </div>
                <div className="rounded-lg border border-shell-border bg-shell-bg/70 px-4 py-3">
                    <p className="text-eyebrow uppercase tracking-eyebrow text-shell-muted-dim">Below Cut</p>
                    <p className="mt-2 text-xl font-semibold tabular-nums text-danger">
                        {scenario ? scenario.fail_count : '...'}
                    </p>
                </div>
            </div>
        </div>
    );
}

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
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-semibold text-white">Cut-Score What-If</p>
                    <p className="mt-1 text-xs text-gray-500">
                        Compare the pass split against a different threshold without changing the stored test settings.
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-3xl font-bold text-cyan-300">{value}%</p>
                    <p className="text-xs text-gray-500">
                        Baseline {baselineCut !== null ? `${baselineCut}%` : 'not set'}
                    </p>
                </div>
            </div>

            <div className="mt-5">
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={value}
                    onChange={(event) => onChange(Number(event.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-800 accent-cyan-400"
                />
                <div className="mt-2 flex justify-between text-[11px] text-gray-500">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Pass Rate</p>
                    <p className="mt-2 text-xl font-semibold text-emerald-300">
                        {scenario ? `${scenario.pass_rate.toFixed(1)}%` : '...'}
                    </p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Passing</p>
                    <p className="mt-2 text-xl font-semibold text-blue-300">
                        {scenario ? scenario.pass_count : '...'}
                    </p>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Below Cut</p>
                    <p className="mt-2 text-xl font-semibold text-rose-300">
                        {scenario ? scenario.fail_count : '...'}
                    </p>
                </div>
            </div>
        </div>
    );
}

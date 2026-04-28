'use client';

import type { ItemHistoryEntry } from '@/lib/analytics.types';

const WIDTH = 680;
const HEIGHT = 240;
const PADDING_X = 42;
const PADDING_Y = 26;

function buildPolyline(points: Array<{ x: number; y: number }>): string {
    return points.map((point) => `${point.x},${point.y}`).join(' ');
}

export default function PDValueTrendChart({ entries }: { entries: ItemHistoryEntry[] }) {
    const validValues = entries.flatMap((entry) => [entry.p_value, entry.d_value]).filter((value): value is number => value !== null);

    if (entries.length === 0 || validValues.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-gray-800 bg-gray-900/50 px-4 py-10 text-center text-sm text-gray-500">
                No objective-item history is available yet.
            </div>
        );
    }

    const minValue = Math.min(...validValues, 0);
    const maxValue = Math.max(...validValues, 1);
    const range = maxValue - minValue || 1;
    const stepX = entries.length > 1 ? (WIDTH - PADDING_X * 2) / (entries.length - 1) : 0;

    const toY = (value: number) => HEIGHT - PADDING_Y - ((value - minValue) / range) * (HEIGHT - PADDING_Y * 2);
    const pPoints = entries
        .map((entry, index) => (entry.p_value === null ? null : ({ x: PADDING_X + stepX * index, y: toY(entry.p_value) })))
        .filter((point): point is { x: number; y: number } => point !== null);
    const dPoints = entries
        .map((entry, index) => (entry.d_value === null ? null : ({ x: PADDING_X + stepX * index, y: toY(entry.d_value) })))
        .filter((point): point is { x: number; y: number } => point !== null);

    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-5">
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
                    P-value
                </span>
                <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    D-value
                </span>
            </div>

            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full">
                {[0, 0.5, 1].map((ratio) => {
                    const y = PADDING_Y + (HEIGHT - PADDING_Y * 2) * ratio;
                    const value = maxValue - range * ratio;
                    return (
                        <g key={ratio}>
                            <line
                                x1={PADDING_X}
                                x2={WIDTH - PADDING_X}
                                y1={y}
                                y2={y}
                                stroke="rgba(148,163,184,0.18)"
                                strokeDasharray="4 4"
                            />
                            <text x={8} y={y + 4} fill="rgba(148,163,184,0.8)" fontSize="11">
                                {value.toFixed(2)}
                            </text>
                        </g>
                    );
                })}

                {pPoints.length > 1 ? (
                    <polyline
                        points={buildPolyline(pPoints)}
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                ) : null}

                {dPoints.length > 1 ? (
                    <polyline
                        points={buildPolyline(dPoints)}
                        fill="none"
                        stroke="#fbbf24"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                ) : null}

                {entries.map((entry, index) => {
                    const x = PADDING_X + stepX * index;
                    return (
                        <text
                            key={`${entry.item_version_id}-${entry.test_definition_id}`}
                            x={x}
                            y={HEIGHT - 6}
                            fill="rgba(148,163,184,0.8)"
                            fontSize="10"
                            textAnchor="middle"
                        >
                            v{entry.version_number ?? index + 1}
                        </text>
                    );
                })}

                {pPoints.map((point, index) => (
                    <circle key={`p-${index}`} cx={point.x} cy={point.y} r="4.5" fill="#22d3ee" />
                ))}
                {dPoints.map((point, index) => (
                    <circle key={`d-${index}`} cx={point.x} cy={point.y} r="4.5" fill="#fbbf24" />
                ))}
            </svg>
        </div>
    );
}

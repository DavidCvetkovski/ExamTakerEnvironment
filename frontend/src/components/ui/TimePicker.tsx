'use client';

import { useRef, useState, useEffect } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside';

interface TimePickerProps {
    value: Date | null;
    onChange: (date: Date) => void;
    step?: number; // minute increment, default 5
}

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function formatDisplayTime(date: Date | null): string {
    if (!date) return 'Select time';
    const h = date.getHours();
    const m = date.getMinutes();
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${pad(h12)}:${pad(m)} ${period}`;
}

function SpinnerColumn({
    values,
    selectedIndex,
    onSelect,
    ariaLabel,
}: {
    values: string[];
    selectedIndex: number;
    onSelect: (index: number) => void;
    ariaLabel: string;
}) {
    const prev = () => onSelect(Math.max(0, selectedIndex - 1));
    const next = () => onSelect(Math.min(values.length - 1, selectedIndex + 1));

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        if (e.deltaY > 0) next();
        else prev();
    };

    return (
        <div
            role="spinbutton"
            aria-label={ariaLabel}
            aria-valuenow={selectedIndex}
            aria-valuemin={0}
            aria-valuemax={values.length - 1}
            aria-valuetext={values[selectedIndex]}
            tabIndex={0}
            className="flex flex-col items-center select-none outline-none"
            onWheel={handleWheel}
            onKeyDown={(e) => {
                if (e.key === 'ArrowUp') { e.preventDefault(); prev(); }
                if (e.key === 'ArrowDown') { e.preventDefault(); next(); }
            }}
        >
            <button
                type="button"
                onClick={prev}
                disabled={selectedIndex === 0}
                className="flex h-7 w-full items-center justify-center text-shell-muted hover:text-foreground transition-colors disabled:opacity-30"
                aria-label={`Previous ${ariaLabel}`}
            >
                ▲
            </button>

            {[-1, 0, 1].map((offset) => {
                const idx = selectedIndex + offset;
                const valid = idx >= 0 && idx < values.length;
                return (
                    <div
                        key={offset}
                        onClick={() => valid && onSelect(idx)}
                        className={[
                            'flex h-9 w-14 cursor-pointer items-center justify-center rounded-lg text-sm font-mono transition-all',
                            offset === 0
                                ? 'font-semibold scale-105'
                                : 'opacity-35 text-shell-muted text-xs scale-95',
                        ].join(' ')}
                        style={offset === 0 ? {
                            backgroundColor: 'var(--color-brand)',
                            color: 'white',
                        } : {}}
                    >
                        {valid ? values[idx] : ''}
                    </div>
                );
            })}

            <button
                type="button"
                onClick={next}
                disabled={selectedIndex === values.length - 1}
                className="flex h-7 w-full items-center justify-center text-shell-muted hover:text-foreground transition-colors disabled:opacity-30"
                aria-label={`Next ${ariaLabel}`}
            >
                ▼
            </button>
        </div>
    );
}

export function TimePicker({ value, onChange, step = 5 }: TimePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useClickOutside(containerRef, () => setIsOpen(false));

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen]);

    // Derive current h12, minute-index, period from value
    const now = value ?? new Date();
    const rawHour = now.getHours();
    const rawMinute = now.getMinutes();
    const period = rawHour >= 12 ? 'PM' : 'AM';
    const h12 = rawHour % 12 || 12;

    // Build value arrays
    const hours = Array.from({ length: 12 }, (_, i) => pad(i + 1));
    const minuteCount = Math.ceil(60 / step);
    const minutes = Array.from({ length: minuteCount }, (_, i) => pad(i * step));
    const periods = ['AM', 'PM'];

    const hourIndex = h12 - 1;
    // Snap to nearest step
    const minuteIndex = Math.min(Math.round(rawMinute / step), minuteCount - 1);
    const periodIndex = period === 'AM' ? 0 : 1;

    const applyChange = (newH12: number, newMinIdx: number, newPeriodIdx: number) => {
        const newMinute = newMinIdx * step;
        const isPM = newPeriodIdx === 1;
        let newHour = newH12 % 12;
        if (isPM) newHour += 12;
        const next = new Date(now);
        next.setHours(newHour, newMinute, 0, 0);
        onChange(next);
    };

    return (
        <div ref={containerRef} className="relative" role="group" aria-label="Time picker">
            <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                onClick={() => setIsOpen((o) => !o)}
                className="flex w-full items-center gap-2 rounded-xl border border-shell-border bg-shell-input px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-shell-border-deep focus:outline-none focus:border-brand"
            >
                <svg className="w-4 h-4 flex-shrink-0 text-shell-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className={value ? 'font-mono text-foreground' : 'text-shell-muted'}>
                    {formatDisplayTime(value)}
                </span>
            </button>

            {isOpen && (
                <div
                    role="dialog"
                    aria-label="Time selector"
                    className="absolute left-0 top-full z-50 mt-2 rounded-xl border border-shell-border bg-shell-surface shadow-elevated"
                >
                    <div className="px-4 pt-3 pb-1 border-b border-shell-border">
                        <p className="text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim text-center">
                            Select time
                        </p>
                    </div>
                    <div className="flex items-start gap-1 px-3 py-3">
                        <SpinnerColumn
                            values={hours}
                            selectedIndex={hourIndex}
                            ariaLabel="Hour"
                            onSelect={(idx) => applyChange(idx + 1, minuteIndex, periodIndex)}
                        />
                        <div className="flex items-center justify-center h-9 mt-7 text-lg font-semibold text-shell-muted-dim select-none">:</div>
                        <SpinnerColumn
                            values={minutes}
                            selectedIndex={minuteIndex}
                            ariaLabel="Minute"
                            onSelect={(idx) => applyChange(h12, idx, periodIndex)}
                        />
                        <div className="w-2" />
                        <SpinnerColumn
                            values={periods}
                            selectedIndex={periodIndex}
                            ariaLabel="Period"
                            onSelect={(idx) => applyChange(h12, minuteIndex, idx)}
                        />
                    </div>
                    <div className="border-t border-shell-border px-3 py-2">
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="w-full rounded-lg py-1.5 text-center text-xs font-medium text-shell-muted hover:text-foreground transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

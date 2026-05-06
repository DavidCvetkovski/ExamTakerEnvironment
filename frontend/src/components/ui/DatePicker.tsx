'use client';

import { useRef, useState, useEffect, useId } from 'react';
import { useClickOutside } from '@/hooks/useClickOutside';

interface DatePickerProps {
    value: Date | null;
    onChange: (date: Date) => void;
    min?: Date;
    max?: Date;
    label?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
}

function startOfMonth(year: number, month: number): Date {
    return new Date(year, month, 1);
}

function daysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

function formatDisplayDate(date: Date | null): string {
    if (!date) return 'Select date';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toInputValue(date: Date | null): string {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function DatePicker({ value, onChange, min, max }: DatePickerProps) {
    const today = new Date();
    const [isOpen, setIsOpen] = useState(false);
    const [viewYear, setViewYear] = useState(() => (value ?? today).getFullYear());
    const [viewMonth, setViewMonth] = useState(() => (value ?? today).getMonth());
    const containerRef = useRef<HTMLDivElement | null>(null);
    const nativeInputId = useId();

    useClickOutside(containerRef, () => setIsOpen(false));

    // Escape to close
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen]);

    // Sync view when value changes externally
    useEffect(() => {
        if (value) {
            setViewYear(value.getFullYear());
            setViewMonth(value.getMonth());
        }
    }, [value]);

    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(viewYear, viewMonth));

    const prevMonth = () => {
        if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
        else setViewMonth((m) => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
        else setViewMonth((m) => m + 1);
    };

    // Build grid — pad with nulls for leading empty cells
    const firstDayOfWeek = startOfMonth(viewYear, viewMonth).getDay();
    const totalDays = daysInMonth(viewYear, viewMonth);
    const cells: (number | null)[] = [
        ...Array(firstDayOfWeek).fill(null),
        ...Array.from({ length: totalDays }, (_, i) => i + 1),
    ];
    // Pad to complete last row
    while (cells.length % 7 !== 0) cells.push(null);

    const selectDay = (day: number) => {
        const next = new Date(value ?? today);
        next.setFullYear(viewYear, viewMonth, day);
        onChange(next);
        setIsOpen(false);
    };

    const isDisabled = (day: number): boolean => {
        const d = new Date(viewYear, viewMonth, day);
        if (min && d < new Date(min.getFullYear(), min.getMonth(), min.getDate())) return true;
        if (max && d > new Date(max.getFullYear(), max.getMonth(), max.getDate())) return true;
        return false;
    };

    // Native input typed entry fallback
    const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const [y, m, d] = e.target.value.split('-').map(Number);
        if (!y || !m || !d) return;
        const next = new Date(value ?? today);
        next.setFullYear(y, m - 1, d);
        onChange(next);
        setViewYear(y);
        setViewMonth(m - 1);
    };

    return (
        <div ref={containerRef} className="relative" role="group" aria-label="Date picker">
            <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                onClick={() => setIsOpen((o) => !o)}
                className="flex w-full items-center gap-2 rounded-xl border border-shell-border bg-shell-input px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-shell-border-deep focus:outline-none focus:border-brand"
            >
                <svg className="w-4 h-4 flex-shrink-0 text-shell-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className={value ? 'text-foreground' : 'text-shell-muted'}>
                    {formatDisplayDate(value)}
                </span>
            </button>

            {/* Hidden native input for paste/typed entry */}
            <input
                id={nativeInputId}
                type="date"
                tabIndex={-1}
                aria-hidden="true"
                value={toInputValue(value)}
                min={min ? toInputValue(min) : undefined}
                max={max ? toInputValue(max) : undefined}
                onChange={handleNativeChange}
                className="sr-only"
            />

            {isOpen && (
                <div
                    role="dialog"
                    aria-label="Calendar"
                    className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-shell-border bg-shell-surface shadow-elevated"
                >
                    {/* Month / year navigation */}
                    <div className="flex items-center justify-between border-b border-shell-border px-3 py-2.5">
                        <button
                            type="button"
                            onClick={prevMonth}
                            className="rounded-lg p-1.5 text-shell-muted hover:bg-shell-input hover:text-foreground transition-colors"
                            aria-label="Previous month"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <span className="text-sm font-semibold text-foreground">
                            {monthName} {viewYear}
                        </span>
                        <button
                            type="button"
                            onClick={nextMonth}
                            className="rounded-lg p-1.5 text-shell-muted hover:bg-shell-input hover:text-foreground transition-colors"
                            aria-label="Next month"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>

                    {/* Weekday header */}
                    <div className="grid grid-cols-7 border-b border-shell-border px-2 py-1.5">
                        {WEEKDAYS.map((d) => (
                            <div key={d} className="text-center text-eyebrow font-semibold text-shell-muted-dim">
                                {d}
                            </div>
                        ))}
                    </div>

                    {/* Day grid */}
                    <div className="grid grid-cols-7 gap-y-0.5 p-2" role="grid">
                        {cells.map((day, idx) => {
                            if (day === null) {
                                return <div key={`empty-${idx}`} role="gridcell" />;
                            }
                            const isSelected = value ? isSameDay(value, new Date(viewYear, viewMonth, day)) : false;
                            const isToday = isSameDay(today, new Date(viewYear, viewMonth, day));
                            const disabled = isDisabled(day);
                            return (
                                <button
                                    key={day}
                                    type="button"
                                    role="gridcell"
                                    aria-selected={isSelected}
                                    disabled={disabled}
                                    onClick={() => !disabled && selectDay(day)}
                                    className={[
                                        'flex h-8 w-full items-center justify-center rounded-lg text-sm transition-colors',
                                        disabled ? 'cursor-not-allowed opacity-30' : 'cursor-pointer',
                                        isSelected
                                            ? 'font-semibold text-foreground'
                                            : isToday
                                            ? 'font-semibold text-foreground ring-1 ring-inset ring-shell-border-deep'
                                            : disabled
                                            ? 'text-shell-muted-dim'
                                            : 'text-foreground hover:bg-shell-input',
                                    ].join(' ')}
                                    style={isSelected ? { backgroundColor: 'var(--color-brand)', color: 'white' } : {}}
                                >
                                    {day}
                                </button>
                            );
                        })}
                    </div>

                    {/* "Today" shortcut */}
                    <div className="border-t border-shell-border px-3 py-2">
                        <button
                            type="button"
                            onClick={() => { selectDay(today.getDate()); setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }}
                            className="w-full rounded-lg py-1.5 text-center text-xs font-medium text-shell-muted hover:text-foreground transition-colors"
                        >
                            Today
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

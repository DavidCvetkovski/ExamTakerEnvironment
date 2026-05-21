'use client';

import { useId, useMemo, useRef, useState } from 'react';

import type { StudentCandidate } from '@/stores/useCourseStore';
import { useClickOutside } from '@/hooks/useClickOutside';

interface StudentSearchSelectProps {
    candidates: StudentCandidate[];
    onSelect: (studentId: string) => void;
    disabled?: boolean;
}

const MAX_SUGGESTIONS = 8;

export default function StudentSearchSelect({ candidates, onSelect, disabled }: StudentSearchSelectProps) {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const listboxId = useId();

    useClickOutside(containerRef, () => setIsOpen(false));

    const matches = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const pool = needle
            ? candidates.filter((student) => student.email.toLowerCase().includes(needle))
            : candidates;
        return pool.slice(0, MAX_SUGGESTIONS);
    }, [candidates, query]);

    const choose = (student: StudentCandidate) => {
        onSelect(student.id);
        setQuery('');
        setIsOpen(false);
        setHighlight(0);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setIsOpen(true);
            setHighlight((index) => Math.min(index + 1, matches.length - 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlight((index) => Math.max(index - 1, 0));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const picked = matches[highlight];
            if (picked) choose(picked);
        } else if (event.key === 'Escape') {
            setIsOpen(false);
        }
    };

    return (
        <div ref={containerRef} className="relative">
            <input
                type="text"
                role="combobox"
                aria-expanded={isOpen}
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-label="Search students by email"
                disabled={disabled}
                value={query}
                onChange={(event) => {
                    setQuery(event.target.value);
                    setIsOpen(true);
                    setHighlight(0);
                }}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleKeyDown}
                placeholder="Start typing an email…"
                className="w-full rounded-2xl border border-shell-border bg-shell-input px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand disabled:opacity-50"
            />

            {isOpen && (
                <div
                    id={listboxId}
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-xl border border-shell-border bg-shell-surface shadow-elevated"
                >
                    {matches.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-shell-muted-dim">
                            {candidates.length === 0 ? 'Everyone is already enrolled.' : 'No matching students.'}
                        </p>
                    ) : (
                        matches.map((student, index) => (
                            <button
                                key={student.id}
                                type="button"
                                role="option"
                                aria-selected={index === highlight}
                                onMouseEnter={() => setHighlight(index)}
                                onClick={() => choose(student)}
                                className={[
                                    'flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors',
                                    index === highlight ? 'bg-shell-input text-foreground' : 'text-shell-muted hover:text-foreground',
                                ].join(' ')}
                            >
                                {student.email}
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

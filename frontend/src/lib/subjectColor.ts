// Deterministic subject → palette tone hash (CLAUDE.md §8.5).
// Same subject string yields the same tone across every surface. Palette tokens are
// declared in globals.css per theme (--color-subject-{1..8}-{bg,fg,border}).

export type SubjectTone = {
    bg: string;
    fg: string;
    border: string;
    /** Solid dot tone (for legend dots and 4px chips). */
    dot: string;
    /** Slot index 1..8, useful for debug/tests. */
    slot: number;
};

const PALETTE_SIZE = 8;

function hash(input: string): number {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

const FALLBACK: SubjectTone = {
    bg: 'bg-shell-input-alt',
    fg: 'text-shell-muted',
    border: 'border-shell-border',
    dot: 'bg-shell-muted-dim',
    slot: 0,
};

// Tailwind's JIT scanner only emits arbitrary-value classes for *literal*
// strings found in the source. Building these via a template (`bg-[var(--
// color-subject-${slot}-bg)]`) means Tailwind never sees the 8 expansions
// and purges them from the bundle — which is exactly the "all topics look
// black or purple" bug we were hitting. Enumerating the table fixes it.
const PALETTE: ReadonlyArray<Omit<SubjectTone, 'slot'>> = [
    { bg: 'bg-[var(--color-subject-1-bg)]', fg: 'text-[var(--color-subject-1-fg)]', border: 'border-[var(--color-subject-1-border)]', dot: 'bg-[var(--color-subject-1-fg)]' },
    { bg: 'bg-[var(--color-subject-2-bg)]', fg: 'text-[var(--color-subject-2-fg)]', border: 'border-[var(--color-subject-2-border)]', dot: 'bg-[var(--color-subject-2-fg)]' },
    { bg: 'bg-[var(--color-subject-3-bg)]', fg: 'text-[var(--color-subject-3-fg)]', border: 'border-[var(--color-subject-3-border)]', dot: 'bg-[var(--color-subject-3-fg)]' },
    { bg: 'bg-[var(--color-subject-4-bg)]', fg: 'text-[var(--color-subject-4-fg)]', border: 'border-[var(--color-subject-4-border)]', dot: 'bg-[var(--color-subject-4-fg)]' },
    { bg: 'bg-[var(--color-subject-5-bg)]', fg: 'text-[var(--color-subject-5-fg)]', border: 'border-[var(--color-subject-5-border)]', dot: 'bg-[var(--color-subject-5-fg)]' },
    { bg: 'bg-[var(--color-subject-6-bg)]', fg: 'text-[var(--color-subject-6-fg)]', border: 'border-[var(--color-subject-6-border)]', dot: 'bg-[var(--color-subject-6-fg)]' },
    { bg: 'bg-[var(--color-subject-7-bg)]', fg: 'text-[var(--color-subject-7-fg)]', border: 'border-[var(--color-subject-7-border)]', dot: 'bg-[var(--color-subject-7-fg)]' },
    { bg: 'bg-[var(--color-subject-8-bg)]', fg: 'text-[var(--color-subject-8-fg)]', border: 'border-[var(--color-subject-8-border)]', dot: 'bg-[var(--color-subject-8-fg)]' },
];

export function subjectTone(subject: string | null | undefined): SubjectTone {
    if (!subject) return FALLBACK;
    const trimmed = subject.trim();
    if (!trimmed) return FALLBACK;

    const slot = (hash(trimmed.toLowerCase()) % PALETTE_SIZE) + 1;
    return { ...PALETTE[slot - 1], slot };
}

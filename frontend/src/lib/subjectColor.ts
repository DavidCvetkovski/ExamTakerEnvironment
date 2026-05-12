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

export function subjectTone(subject: string | null | undefined): SubjectTone {
    if (!subject) return FALLBACK;
    const trimmed = subject.trim();
    if (!trimmed) return FALLBACK;

    const slot = (hash(trimmed.toLowerCase()) % PALETTE_SIZE) + 1;
    return {
        bg: `bg-[var(--color-subject-${slot}-bg)]`,
        fg: `text-[var(--color-subject-${slot}-fg)]`,
        border: `border-[var(--color-subject-${slot}-border)]`,
        dot: `bg-[var(--color-subject-${slot}-fg)]`,
        slot,
    };
}

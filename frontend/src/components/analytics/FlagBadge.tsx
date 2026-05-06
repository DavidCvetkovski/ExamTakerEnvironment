'use client';

const FLAG_STYLES: Record<string, string> = {
    TOO_HARD: 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-danger',
    TOO_EASY: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    POOR_DISCRIMINATION: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200',
    NEGATIVE_DISCRIMINATION: 'border-red-500/40 bg-red-500/10 text-red-200',
};

function formatLabel(code: string): string {
    return code
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export default function FlagBadge({ code }: { code: string }) {
    const className = FLAG_STYLES[code] ?? 'border-shell-border-deep bg-shell-input text-foreground';

    return (
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-eyebrow font-semibold ${className}`}>
            {formatLabel(code)}
        </span>
    );
}

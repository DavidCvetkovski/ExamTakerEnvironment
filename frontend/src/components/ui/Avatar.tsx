'use client';

import { cn } from './cn';
import { emailToInitials } from '@/lib/initials';
import { subjectTone } from '@/lib/subjectColor';

type Size = 'sm' | 'md' | 'lg';

interface AvatarProps {
    email?: string | null;
    /** Override the initials. If omitted, derived from email. */
    initials?: string;
    size?: Size;
    className?: string;
    title?: string;
}

const SIZE: Record<Size, string> = {
    sm: 'h-7 w-7 text-eyebrow',
    md: 'h-8 w-8 text-meta',
    lg: 'h-10 w-10 text-body',
};

/**
 * Deterministically-tinted circular avatar. Hashes the email through the
 * subject palette so the same user gets a stable color across surfaces.
 */
export default function Avatar({ email, initials, size = 'md', className, title }: AvatarProps) {
    const letters = (initials ?? emailToInitials(email)).slice(0, 2);
    const tone = subjectTone(email ?? letters);

    return (
        <span
            title={title ?? email ?? undefined}
            className={cn(
                'inline-flex items-center justify-center rounded-full border font-semibold select-none',
                tone.bg,
                tone.fg,
                tone.border,
                SIZE[size],
                className,
            )}
        >
            {letters}
        </span>
    );
}

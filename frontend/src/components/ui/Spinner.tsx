'use client';

import { cn } from './cn';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type Tone = 'brand' | 'muted' | 'current';

interface SpinnerProps {
    size?: Size;
    tone?: Tone;
    className?: string;
}

const SIZE: Record<Size, string> = {
    xs: 'w-3 h-3 border-[1.5px]',
    sm: 'w-4 h-4 border-2',
    md: 'w-5 h-5 border-2',
    lg: 'w-6 h-6 border-2',
    xl: 'w-12 h-12 border-4',
};

const TONE: Record<Tone, string> = {
    brand: 'border-brand',
    muted: 'border-shell-muted-dim',
    current: 'border-current',
};

export default function Spinner({ size = 'md', tone = 'brand', className }: SpinnerProps) {
    return (
        <div
            aria-label="Loading"
            role="status"
            className={cn(
                'inline-block rounded-full border-t-transparent animate-spin',
                SIZE[size],
                TONE[tone],
                className,
            )}
        />
    );
}

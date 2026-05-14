/**
 * Shared monochrome SVG icons. Use these instead of decorative glyph
 * characters for check / cross / alert marks — see CLAUDE.md §7.2.
 * All icons inherit `currentColor` and accept a `size` (px) plus an
 * optional `className`.
 */

interface IconProps {
    size?: number;
    className?: string;
}

export function CheckIcon({ size = 14, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.5L6.5 12L13 5" />
        </svg>
    );
}

export function XIcon({ size = 14, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l8 8M12 4l-8 8" />
        </svg>
    );
}

export function AlertIcon({ size = 14, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} className={className} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 1.8L15 14H1L8 1.8z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 6.5v3.2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 11.8h.01" />
        </svg>
    );
}

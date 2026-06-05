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

export function RefreshIcon({ size = 16, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
    );
}

export function KeyboardIcon({ size = 16, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
        </svg>
    );
}

export function LockIcon({ size = 13, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
            <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v4A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7H5Zm1 0h4V5a2 2 0 1 0-4 0v2Z" />
        </svg>
    );
}

// Date/time formatting utilities (CLAUDE.md §7.11).
// All consumer code MUST go through these helpers — direct toLocaleString() is banned.

type Input = string | Date | number;

function toDate(input: Input): Date {
    if (input instanceof Date) return input;
    return new Date(input);
}

const SHORT_DATE_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
const SHORT_DATETIME_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
const FULL_OPTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };

/** Past event in conversational form: "Just now", "5 minutes ago", "Yesterday", "Mar 12, 2026" (older than 7 days). */
export function formatRelativeTime(input: Input): string {
    const date = toDate(input);
    const now = Date.now();
    const diffMs = now - date.getTime();
    if (diffMs < 0) return formatScheduled(date);

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 45) return 'Just now';
    if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
    if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay} days ago`;
    return date.toLocaleDateString(undefined, SHORT_DATE_OPTS);
}

/** Future / scheduled time. Within 24h, relative ("in 3 hours"); otherwise "Mar 12, 14:30". */
export function formatScheduled(input: Input): string {
    const date = toDate(input);
    const diffMs = date.getTime() - Date.now();
    if (diffMs <= 0) return formatRelativeTime(date);

    const diffMin = Math.floor(diffMs / 60_000);
    const diffHr = Math.floor(diffMin / 60);

    if (diffMin < 1) return 'Starting now';
    if (diffMin < 60) return `In ${diffMin} minute${diffMin === 1 ? '' : 's'}`;
    if (diffHr < 24) return `In ${diffHr} hour${diffHr === 1 ? '' : 's'}`;
    return date.toLocaleDateString(undefined, SHORT_DATETIME_OPTS);
}

/** Full absolute timestamp for tooltips and audit logs. */
export function formatAbsolute(input: Input, opts?: { withSeconds?: boolean }): string {
    const date = toDate(input);
    const base: Intl.DateTimeFormatOptions = opts?.withSeconds
        ? { ...FULL_OPTS, second: '2-digit' }
        : FULL_OPTS;
    return date.toLocaleString(undefined, base);
}

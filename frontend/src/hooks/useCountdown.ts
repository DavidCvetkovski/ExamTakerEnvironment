/**
 * Countdown to an ISO target.
 *
 * Returns structured data, not just a display string — callers that need to
 * react to the transition (e.g. swap a row out of "Ongoing") read `hasElapsed`.
 *
 * The hook does NOT count *up* past zero. When `targetIso` has passed, the
 * `display` is the elapsed sentinel and `msRemaining` is non-positive.
 * Backed by the shared `useNow(1000)` tick so every countdown on a page
 * advances together — no per-instance setInterval.
 */

import { useNow } from './useNow';

const ELAPSED_DISPLAY = '—';

export interface CountdownState {
    display: string;
    msRemaining: number;
    hasElapsed: boolean;
}

function formatDuration(ms: number): string {
    if (ms <= 0) return ELAPSED_DISPLAY;
    const totalSeconds = Math.floor(ms / 1000);
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export function useCountdown(targetIso: string): CountdownState {
    const now = useNow(1000);
    const msRemaining = new Date(targetIso).getTime() - now.getTime();
    const hasElapsed = msRemaining <= 0;
    return {
        display: formatDuration(msRemaining),
        msRemaining,
        hasElapsed,
    };
}

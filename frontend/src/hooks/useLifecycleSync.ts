/**
 * Transition-aware refetch for scheduled-session lists.
 *
 * Instead of polling every N seconds (blunt, wasteful, still up to N seconds
 * stale), this hook:
 *   1. Computes the soonest future `starts_at` / `ends_at` across visible rows.
 *   2. Sets a `setTimeout` to call `refetch` exactly at that moment + 500ms buffer.
 *   3. Keeps a 60-second heartbeat as a safety net (clock drift, missed
 *      wake-ups when the tab was backgrounded, sessions canceled elsewhere).
 *
 * Effect: dashboards silently re-sync within ~500ms of any real transition,
 * with zero polling pressure when no transition is imminent.
 *
 * Debounce: if two refetch triggers fire within 500ms (e.g. a heartbeat right
 * after a precise wake), we only call refetch once. This is critical because
 * `sessions` may change shape after the first refetch and re-trigger the effect.
 */

import { useEffect, useRef } from 'react';

import {
    type ScheduledLifecycleInput,
    nextTransitionAt,
} from '@/lib/sessionLifecycle';

const SAFETY_POLL_MS = 60_000;
const PRECISE_WAKE_BUFFER_MS = 500;
const DEBOUNCE_MS = 500;

export function useLifecycleSync(
    sessions: ScheduledLifecycleInput[],
    refetch: () => void | Promise<void>,
): void {
    // Stable ref so the effect can read the latest refetch without re-subscribing.
    const refetchRef = useRef(refetch);
    refetchRef.current = refetch;

    useEffect(() => {
        let lastCallAt = 0;
        const debouncedRefetch = () => {
            const nowMs = Date.now();
            if (nowMs - lastCallAt < DEBOUNCE_MS) return;
            lastCallAt = nowMs;
            void refetchRef.current();
        };

        const transition = nextTransitionAt(sessions, new Date());
        const preciseTimer =
            transition !== null
                ? window.setTimeout(
                      debouncedRefetch,
                      Math.max(0, transition.getTime() - Date.now()) +
                          PRECISE_WAKE_BUFFER_MS,
                  )
                : null;

        const safetyInterval = window.setInterval(debouncedRefetch, SAFETY_POLL_MS);

        return () => {
            if (preciseTimer !== null) window.clearTimeout(preciseTimer);
            window.clearInterval(safetyInterval);
        };
    }, [sessions]);
}

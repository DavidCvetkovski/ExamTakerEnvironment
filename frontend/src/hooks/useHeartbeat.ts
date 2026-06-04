import { useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { useExamStore } from '@/stores/useExamStore';

const HEARTBEAT_INTERVAL_MS = 2000;

/**
 * Custom hook that auto-saves pending interaction events every 2 seconds.
 *
 * - Watches pendingEvents in the exam store
 * - Flushes on interval, visibility change, and before page unload
 * - Uses navigator.sendBeacon as a last resort on tab close
 */
export function useHeartbeat(sessionId: string) {
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const flushEvents = useExamStore((s) => s.flushEvents);
    const pendingEvents = useExamStore((s) => s.pendingEvents);

    const flush = useCallback(() => {
        flushEvents(sessionId);
    }, [flushEvents, sessionId]);

    // Periodic flush
    useEffect(() => {
        intervalRef.current = setInterval(() => {
            const events = useExamStore.getState().pendingEvents;
            if (events.length > 0) {
                flush();
            }
        }, HEARTBEAT_INTERVAL_MS);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [flush]);

    // Flush on visibility change (tab switch, minimize)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                const events = useExamStore.getState().pendingEvents;
                if (events.length > 0) {
                    flush();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [flush]);

    // Flush on beforeunload (tab close, navigate away)
    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            const events = useExamStore.getState().pendingEvents;
            if (events.length > 0) {
                const payload = JSON.stringify({ events });
                const blob = new Blob([payload], { type: 'application/json' });
                // H-3: build the URL by interpolation with a trailing-slash guard.
                // `new URL(relPath, base)` drops the last path segment when the base
                // has no trailing slash (e.g. ".../api" → ".../sessions/â€¦"), so the
                // beacon would 404 and the last answer batch would be lost.
                const base = (api.defaults.baseURL ?? window.location.origin).replace(/\/$/, '');
                navigator.sendBeacon(`${base}/sessions/${sessionId}/heartbeat`, blob);

                // Also persist to localStorage as absolute fallback
                try {
                    const key = `openvision_heartbeat_queue_${sessionId}`;
                    const existing = localStorage.getItem(key);
                    const queued = existing ? JSON.parse(existing) : [];
                    localStorage.setItem(key, JSON.stringify([...queued, ...events]));
                } catch {
                    // localStorage unavailable
                }

                // S-4: trigger the browser's native "Leave page?" prompt so an
                // accidental close/back doesn't silently abandon the exam. Modern
                // browsers show their own generic copy and ignore custom text.
                event.preventDefault();
                event.returnValue = '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [sessionId]);

    return { pendingCount: pendingEvents.length };
}

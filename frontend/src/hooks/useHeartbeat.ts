import { useEffect, useRef, useCallback } from 'react';
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
        const handleBeforeUnload = () => {
            const events = useExamStore.getState().pendingEvents;
            if (events.length > 0) {
                // Use sendBeacon for reliable delivery on page close
                const token = document.cookie
                    .split('; ')
                    .find((c) => c.startsWith('access_token='))
                    ?.split('=')[1];

                const payload = JSON.stringify({ events });
                const blob = new Blob([payload], { type: 'application/json' });
                navigator.sendBeacon(
                    `http://127.0.0.1:8000/api/sessions/${sessionId}/heartbeat`,
                    blob
                );

                // Also persist to localStorage as absolute fallback
                try {
                    const key = `openvision_heartbeat_queue_${sessionId}`;
                    const existing = localStorage.getItem(key);
                    const queued = existing ? JSON.parse(existing) : [];
                    localStorage.setItem(key, JSON.stringify([...queued, ...events]));
                } catch {
                    // localStorage unavailable
                }
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [sessionId]);

    return { pendingCount: pendingEvents.length };
}

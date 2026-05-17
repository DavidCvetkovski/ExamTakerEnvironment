/**
 * Shared ticking-now primitive.
 *
 * Module-level singleton timer per interval bucket — every subscriber that
 * asks for the same `intervalMs` shares one `setInterval`. This avoids:
 *   (a) N timers drifting independently when N rows each call `useCountdown`,
 *   (b) per-second rerender storms when components re-mount at different times.
 *
 * Built on `useSyncExternalStore` so React 18+ batches subscribers correctly.
 */

import { useSyncExternalStore } from 'react';

type Bucket = {
    listeners: Set<() => void>;
    timer: ReturnType<typeof setInterval> | null;
    now: Date;
};

const buckets = new Map<number, Bucket>();

function getBucket(intervalMs: number): Bucket {
    let bucket = buckets.get(intervalMs);
    if (!bucket) {
        bucket = { listeners: new Set(), timer: null, now: new Date() };
        buckets.set(intervalMs, bucket);
    }
    return bucket;
}

function ensureTimer(intervalMs: number, bucket: Bucket) {
    if (bucket.timer !== null) return;
    bucket.timer = setInterval(() => {
        bucket.now = new Date();
        bucket.listeners.forEach((listener) => listener());
    }, intervalMs);
}

function teardownTimer(bucket: Bucket) {
    if (bucket.timer !== null && bucket.listeners.size === 0) {
        clearInterval(bucket.timer);
        bucket.timer = null;
    }
}

function subscribe(intervalMs: number, listener: () => void): () => void {
    const bucket = getBucket(intervalMs);
    bucket.listeners.add(listener);
    ensureTimer(intervalMs, bucket);
    return () => {
        bucket.listeners.delete(listener);
        teardownTimer(bucket);
    };
}

/**
 * Subscribe to a ticking clock. Default 1s resolution — fine for countdowns
 * and lifecycle bucketing. Coarser intervals (e.g. 60_000) are right when
 * the consumer only needs minute-resolution copy like "Mar 12, 14:30".
 */
export function useNow(intervalMs: number = 1000): Date {
    return useSyncExternalStore(
        (listener) => subscribe(intervalMs, listener),
        () => getBucket(intervalMs).now,
        () => new Date(), // SSR snapshot — render once, then client-side ticks take over
    );
}

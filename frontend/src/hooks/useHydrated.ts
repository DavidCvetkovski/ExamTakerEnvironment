import { useSyncExternalStore } from 'react';

// A no-op subscribe — the hydration boundary never changes after the first
// client render, so there is nothing to subscribe to.
const subscribe = () => () => {};

/**
 * Returns `false` during SSR and the first client render, then `true` once the
 * component has hydrated on the client.
 *
 * Replaces the `useState(false)` + `useEffect(() => setMounted(true), [])`
 * pattern — `useSyncExternalStore` gets the same result from distinct
 * server/client snapshots without calling setState inside an effect.
 */
export function useHydrated(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => true, // client snapshot
        () => false, // server snapshot
    );
}

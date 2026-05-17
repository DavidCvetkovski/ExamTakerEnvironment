/**
 * Client-vs-server clock skew tracking.
 *
 * The backend stamps every scheduled-sessions list response with `server_now`.
 * Fetch wrappers call `recordServerNow` with that timestamp; the resulting
 * `clientSkewMs` (server - client) is the correction the frontend applies
 * whenever it derives a lifecycle state from "now".
 *
 * Why module-level instead of a Zustand store: skew is a process-wide fact,
 * not domain state, and `useServerNow` is called every tick across many
 * components — a plain `let` avoids unnecessary re-render subscriptions.
 * Updates propagate within one `useNow` tick (≤1s) on the consumer side.
 */

let clientSkewMs = 0;

export function recordServerNow(serverIso: string): void {
    const serverMs = new Date(serverIso).getTime();
    if (Number.isNaN(serverMs)) return; // defensive — ignore malformed timestamps
    clientSkewMs = serverMs - Date.now();
}

export function getClientSkewMs(): number {
    return clientSkewMs;
}

/**
 * Pure lifecycle derivation for scheduled exam sessions.
 *
 * Mirrors `backend/app/services/scheduled_sessions_service.ensure_scheduled_session_current`
 * exactly. The two sides must stay in lockstep — if the backend rules change,
 * update this file in the same commit.
 *
 * Rules (priority order):
 *   1. CANCELED short-circuits — no derivation, persisted status wins.
 *   2. now >= ends_at      → CLOSED
 *   3. now >= starts_at    → ACTIVE
 *   4. otherwise           → SCHEDULED
 *
 * No React imports — values in, values out, trivially testable.
 */

export type ScheduledLifecycleStatus = 'SCHEDULED' | 'ACTIVE' | 'CLOSED' | 'CANCELED';

export interface ScheduledLifecycleInput {
    starts_at: string;
    ends_at: string;
    status: string; // raw persisted status from the backend (used only to honor CANCELED)
}

export function deriveScheduledStatus(
    session: ScheduledLifecycleInput,
    now: Date,
): ScheduledLifecycleStatus {
    if (session.status === 'CANCELED') return 'CANCELED';
    const startsAt = new Date(session.starts_at).getTime();
    const endsAt = new Date(session.ends_at).getTime();
    const nowMs = now.getTime();
    if (nowMs >= endsAt) return 'CLOSED';
    if (nowMs >= startsAt) return 'ACTIVE';
    return 'SCHEDULED';
}

/**
 * Soonest future `starts_at` or `ends_at` across non-terminal rows.
 * Returns null when nothing is going to transition (e.g. every row is CLOSED or CANCELED).
 * Used by `useLifecycleSync` to schedule a precise refetch right when a row will flip.
 */
export function nextTransitionAt(
    sessions: ScheduledLifecycleInput[],
    now: Date,
): Date | null {
    const nowMs = now.getTime();
    let soonest = Infinity;
    for (const s of sessions) {
        if (s.status === 'CANCELED') continue;
        const derived = deriveScheduledStatus(s, now);
        if (derived === 'CLOSED') continue;
        // SCHEDULED → ACTIVE flips at starts_at; ACTIVE → CLOSED flips at ends_at.
        const next = derived === 'SCHEDULED'
            ? new Date(s.starts_at).getTime()
            : new Date(s.ends_at).getTime();
        if (next > nowMs && next < soonest) soonest = next;
    }
    return soonest === Infinity ? null : new Date(soonest);
}

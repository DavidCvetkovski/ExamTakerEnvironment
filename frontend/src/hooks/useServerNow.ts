/**
 * Ticking server-corrected "now".
 *
 * Same singleton-timer machinery as `useNow`, plus the client-skew correction
 * recorded on the most recent scheduled-sessions list fetch. Use this — not
 * `useNow` — anywhere a lifecycle state is derived from a timestamp comparison.
 * (Pure display strings — "Mar 12, 14:30", "2 minutes ago" — can stay on
 * `useNow`; the skew correction is only critical for status derivation.)
 */

import { useNow } from './useNow';
import { getClientSkewMs } from '@/lib/serverTime';

export function useServerNow(intervalMs: number = 1000): Date {
    const now = useNow(intervalMs);
    return new Date(now.getTime() + getClientSkewMs());
}

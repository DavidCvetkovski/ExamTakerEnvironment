// Time-of-day theme resolution for the `auto` ThemePreference (CLAUDE.md §7.12).
// Single source of truth — ThemeProvider polls this every 5 minutes.

import type { EffectiveTheme } from '@/stores/useAuthStore';

/**
 * Resolve the effective theme from local time:
 *   05:00–11:59 → warm        (morning)
 *   12:00–18:59 → light-blue  (day)
 *   19:00–04:59 → dark        (night)
 */
export function resolveAutoTheme(now: Date = new Date()): EffectiveTheme {
    const hour = now.getHours();
    if (hour >= 5 && hour < 12) return 'warm';
    if (hour >= 12 && hour < 19) return 'light-blue';
    return 'dark';
}

/** Milliseconds until the next theme-boundary (5/12/19:00 local), capped at 5 minutes. */
export function msUntilNextAutoBoundary(now: Date = new Date()): number {
    const cap = 5 * 60 * 1000;
    const boundaries = [5, 12, 19, 24 + 5].map((h) => {
        const d = new Date(now);
        d.setHours(h, 0, 0, 0);
        if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
        return d.getTime() - now.getTime();
    });
    return Math.min(cap, Math.min(...boundaries));
}

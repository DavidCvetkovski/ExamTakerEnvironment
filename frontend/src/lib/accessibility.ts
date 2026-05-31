/**
 * Accessibility derivations (Epoch 10).
 *
 * Pure functions only — no React imports (CLAUDE.md §3: pure utilities live in
 * `src/lib/`). The single source of truth for how a self-chosen text-scale
 * *preference* composes with an administrator-granted *enlarged-display*
 * accommodation on the exam screen.
 */
import type { TextScale } from '@/stores/useAuthStore';

/** Ordered from smallest to largest — index doubles as the comparison rank. */
const SCALE_ORDER: TextScale[] = ['md', 'lg', 'xl'];

/** The minimum scale an active enlarged-display accommodation forces. */
const ENLARGED_MINIMUM: TextScale = 'lg';

/**
 * Resolve the *effective* exam text scale.
 *
 * A student may pick any `text_scale` preference; an administrator may
 * separately grant `accommodation_enlarged_display`. During an accommodated
 * exam the effective scale is the larger of the two — the grant raises a floor
 * but never shrinks a student who already chose a bigger size:
 *
 *   effective = max(preference ?? 'md', enlarged ? 'lg' : 'md')
 *
 * @param preference  The student's chosen scale (`null` = default `md`).
 * @param enlarged    Whether the enlarged-display accommodation is granted.
 */
export function resolveExamTextScale(
    preference: TextScale | null | undefined,
    enlarged: boolean,
): TextScale {
    const preferenceScale = preference ?? 'md';
    const floor: TextScale = enlarged ? ENLARGED_MINIMUM : 'md';
    return SCALE_ORDER[Math.max(SCALE_ORDER.indexOf(preferenceScale), SCALE_ORDER.indexOf(floor))];
}

/**
 * Pluralization helpers — one source of truth for `1 section` / `N sections`
 * so this class of off-by-one ("1 SECTIONS") stops recurring per-surface.
 *
 * Two shapes:
 *   - `pluralize(count, "section")` → `"section"` or `"sections"` (the noun only).
 *     Use when the count is rendered separately (e.g. in different markup) or
 *     when the noun sits inside surrounding text.
 *   - `pluralizeCount(count, "section")` → `"1 section"` or `"4 sections"`.
 *     Use for the common "count + noun" idiom — saves the template-literal boilerplate.
 *
 * Irregulars pass the plural explicitly:
 *   pluralize(count, "child", "children")
 *   pluralizeCount(count, "person", "people")
 *
 * Lives in `src/lib/` per CLAUDE.md §3 (pure utils, no React imports).
 */

export function pluralize(count: number, singular: string, plural?: string): string {
    if (count === 1) return singular;
    return plural ?? `${singular}s`;
}

export function pluralizeCount(count: number, singular: string, plural?: string): string {
    return `${count} ${pluralize(count, singular, plural)}`;
}

/**
 * Canonical sort-direction indicator (§7.8).
 *
 * Renders only `↑` or `↓`, and only for the active column — there is no `↕`
 * "sortable but inactive" glyph. Replaces the five hand-rolled copies that used
 * to live in each table page.
 */
export type SortDir = 'asc' | 'desc';

export default function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
    if (!active) return null;
    return (
        <span className="ml-1 text-xs text-brand" aria-hidden="true">
            {dir === 'asc' ? '↑' : '↓'}
        </span>
    );
}

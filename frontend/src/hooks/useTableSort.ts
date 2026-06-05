import { useCallback, useState } from 'react';

import type { SortDir } from '@/components/ui/SortArrow';

/**
 * Shared table-sort state (§7.8: tables always have an active sort).
 *
 * Replaces the identical `sortKey`/`sortDir` `useState` pair + `toggle`
 * handler that every sortable table used to hand-roll. Clicking the active
 * column flips direction; clicking a new column selects it ascending.
 *
 * @param initialKey the column the table is sorted by on first render
 * @param initialDir defaults to `'asc'` to satisfy the "default to first
 *   sortable column ascending" rule
 */
export function useTableSort<Key extends string>(
    initialKey: Key,
    initialDir: SortDir = 'asc',
) {
    const [sortKey, setSortKey] = useState<Key>(initialKey);
    const [sortDir, setSortDir] = useState<SortDir>(initialDir);

    const toggle = useCallback((key: Key) => {
        setSortKey((currentKey) => {
            if (currentKey === key) {
                setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                return currentKey;
            }
            setSortDir('asc');
            return key;
        });
    }, []);

    return { sortKey, sortDir, toggle };
}

'use client';

import { useAnnouncerStore } from './useAnnouncer';

/** Visually-hidden ARIA live region that voices messages pushed through the
 *  announcer store. Mounted once at the app root. Screen readers announce text
 *  changes here without moving focus (CLAUDE.md §7.2 — non-visual feedback).
 *
 *  Two alternating regions: each new announcement (tracked by `nonce`) lands in
 *  whichever region is currently empty, guaranteeing a text *change* even when
 *  the same message repeats — a single region wouldn't re-announce identical
 *  text. Purely derived from store state, so no effects/setState. */
export default function LiveRegion() {
    const { message, politeness, nonce } = useAnnouncerStore();
    const isEven = nonce % 2 === 0;

    return (
        <>
            <div aria-live={politeness} aria-atomic="true" role="status" className="sr-only">
                {isEven ? message : ''}
            </div>
            <div aria-live={politeness} aria-atomic="true" role="status" className="sr-only">
                {isEven ? '' : message}
            </div>
        </>
    );
}

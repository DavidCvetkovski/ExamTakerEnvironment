import { create } from 'zustand';

type Politeness = 'polite' | 'assertive';

interface AnnouncerState {
    /** Current message rendered into the live region. */
    message: string;
    politeness: Politeness;
    /** A monotonically increasing key so repeated identical messages still
     *  re-announce (the DOM text would otherwise be unchanged). */
    nonce: number;
    announce: (message: string, politeness?: Politeness) => void;
}

/** App-level screen-reader announcer. A single `aria-live` region (rendered by
 *  <LiveRegion/>) is driven by this store so announcements have one home rather
 *  than scattered aria-live nodes (CLAUDE.md §2). Use the `useAnnounce` hook. */
export const useAnnouncerStore = create<AnnouncerState>((set) => ({
    message: '',
    politeness: 'polite',
    nonce: 0,
    announce: (message, politeness = 'polite') =>
        set((s) => ({ message, politeness, nonce: s.nonce + 1 })),
}));

/** Returns the `announce(message, politeness?)` function. */
export function useAnnounce(): AnnouncerState['announce'] {
    return useAnnouncerStore((s) => s.announce);
}

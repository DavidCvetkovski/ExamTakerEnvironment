import { useEffect, useRef, RefObject } from 'react';

export function useClickOutside(ref: RefObject<HTMLElement | null>, callback: () => void): void {
    const callbackRef = useRef(callback);
    // Keep the ref pointed at the latest callback without re-subscribing the
    // listener. Updated in an effect (after commit) rather than during render.
    useEffect(() => {
        callbackRef.current = callback;
    });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                callbackRef.current();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [ref]);
}

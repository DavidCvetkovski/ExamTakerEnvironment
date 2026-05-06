import { useEffect, RefObject } from 'react';

/**
 * Hook that detects clicks outside of a referenced element and calls a callback.
 * Useful for closing popovers, modals, and dropdowns.
 *
 * @param ref - Reference to the element to monitor
 * @param callback - Function to call when a click occurs outside the element
 */
export function useClickOutside(ref: RefObject<HTMLElement>, callback: () => void): void {
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                callback();
            }
        };

        // Attach the listener on mount
        document.addEventListener('mousedown', handleClickOutside);

        // Cleanup on unmount
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [ref, callback]);
}

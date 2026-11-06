import { useEffect, useRef, type RefObject } from 'react';

/**
 * Calls `onOutside` when the mouse goes down outside every element in `inside`.
 *
 * A modal is never "outside": it is drawn in the body, so it is not inside the panel it was opened from, but it
 * belongs to that panel. Without this a click in the 3D view of a flower closed the flower's details, and the
 * view with them.
 */
export function useDismissOnOutsideClick(
    enabled: boolean,
    inside: ReadonlyArray<RefObject<HTMLElement | null>>,
    onOutside: () => void,
): void {
    // what the listener reads when the mouse goes down, so it is added once and not at every render
    const latest = useRef({ inside, onOutside });
    latest.current = { inside, onOutside };

    useEffect(() => {
        if (!enabled) return;
        const onMouseDown = (event: MouseEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest('[aria-modal="true"]')) return;
            const { inside: elements, onOutside: callback } = latest.current;
            if (elements.some(ref => ref.current?.contains(target as Node))) return;
            callback();
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [enabled]);
}

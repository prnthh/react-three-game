import { useRef } from "react";

/**
 * Shared click-valid pattern: tracks pointer down → move → up
 * to distinguish clicks from drags. Returns handlers to spread onto a group.
 */
export function useClickValid(
    enabled: boolean,
    onValidClick: (e: any) => void
) {
    const clickValid = useRef(false);
    if (!enabled) return { onPointerDown: undefined, onPointerMove: undefined, onPointerUp: undefined };

    return {
        onPointerDown: (e: any) => { e.stopPropagation(); clickValid.current = true; },
        onPointerMove: () => { clickValid.current = false; },
        onPointerUp: (e: any) => {
            if (clickValid.current) {
                e.stopPropagation();
                onValidClick(e);
            }
            clickValid.current = false;
        }
    };
}

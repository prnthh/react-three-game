/** Click requests are independent of button-held state and repeated lock notifications. */
export function bindGravityGunInput(
    events: Pick<Window, 'addEventListener' | 'removeEventListener'>,
    pointer: Pick<Document, 'pointerLockElement' | 'addEventListener' | 'removeEventListener'>,
    actions: { grab(): void; throw(): void; clear(): void; drop(): void },
) {
    const mouseDown = (event: MouseEvent) => {
        if (!pointer.pointerLockElement) return;
        if (event.button === 2) actions.grab();
        if (event.button === 0) actions.throw();
    };
    const lockChanged = () => {
        if (pointer.pointerLockElement) return;
        actions.clear();
        actions.drop();
    };
    events.addEventListener('mousedown', mouseDown);
    events.addEventListener('blur', actions.clear);
    pointer.addEventListener('pointerlockchange', lockChanged);
    return () => {
        events.removeEventListener('mousedown', mouseDown);
        events.removeEventListener('blur', actions.clear);
        pointer.removeEventListener('pointerlockchange', lockChanged);
    };
}

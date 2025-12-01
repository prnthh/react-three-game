import { useRef, useImperativeHandle, forwardRef, useCallback } from 'react';

interface EventSystemRef {
    fire: (eventType: string, data?: any) => void;
}

const EventSystemHook = forwardRef<EventSystemRef, { entityId: string }>(
    ({ entityId }, ref) => {
        const targetRef = useRef<EventTarget>(typeof window !== 'undefined' ? window : null);

        // Fire a global JS event with entityId as source
        const fire = useCallback((eventType: string, data?: any) => {
            if (!targetRef.current) return;

            const event = new CustomEvent(eventType, {
                detail: {
                    entityId,
                    data,
                },
            });

            targetRef.current.dispatchEvent(event);
        }, [entityId]);

        // Expose ref API
        useImperativeHandle(ref, () => ({
            fire,
        }), [fire]);

        return null;
    }
);

EventSystemHook.displayName = 'EventSystemHook';

export default EventSystemHook;
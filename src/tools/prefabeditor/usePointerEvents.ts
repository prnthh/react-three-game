import type { ThreeEvent } from "@react-three/fiber";

export type PointerHandler<T> = (event: ThreeEvent<PointerEvent>, entity: T) => void;

export interface PointerEventHandlers<T> {
    onClick?: PointerHandler<T>;
    onPointerDown?: PointerHandler<T>;
    onPointerUp?: PointerHandler<T>;
    onPointerMove?: PointerHandler<T>;
    onPointerEnter?: PointerHandler<T>;
    onPointerLeave?: PointerHandler<T>;
    onPointerOver?: PointerHandler<T>;
    onPointerOut?: PointerHandler<T>;
}

export interface UsePointerEventsOptions<T> extends PointerEventHandlers<T> {
    enabled: boolean;
    entity: T | null | undefined;
}

export function hasPointerEventHandlers<T>(handlers: PointerEventHandlers<T>) {
    return Boolean(
        handlers.onClick
        || handlers.onPointerDown
        || handlers.onPointerUp
        || handlers.onPointerMove
        || handlers.onPointerEnter
        || handlers.onPointerLeave
        || handlers.onPointerOver
        || handlers.onPointerOut
    );
}

export function usePointerEvents<T>({
    enabled,
    entity,
    onClick,
    onPointerDown,
    onPointerUp,
    onPointerMove,
    onPointerEnter,
    onPointerLeave,
    onPointerOver,
    onPointerOut,
}: UsePointerEventsOptions<T>) {
    if (!enabled) {
        return {
            onClick: undefined,
            onPointerDown: undefined,
            onPointerMove: undefined,
            onPointerUp: undefined,
            onPointerEnter: undefined,
            onPointerLeave: undefined,
            onPointerOver: undefined,
            onPointerOut: undefined,
        };
    }

    const forward = (handler?: PointerHandler<T>) => {
        if (!handler) return undefined;

        return (event: ThreeEvent<PointerEvent>) => {
            event.stopPropagation();
            if (!entity) return;
            handler(event, entity);
        };
    };

    const forwardMove = onPointerMove
        ? (event: ThreeEvent<PointerEvent>) => {
            event.stopPropagation();
            if (!entity) return;
            onPointerMove(event, entity);
        }
        : undefined;

    return {
        onClick: forward(onClick),
        onPointerDown: forward(onPointerDown),
        onPointerMove: forwardMove,
        onPointerUp: forward(onPointerUp),
        onPointerEnter: forward(onPointerEnter),
        onPointerLeave: forward(onPointerLeave),
        onPointerOver: forward(onPointerOver),
        onPointerOut: forward(onPointerOut),
    };
}
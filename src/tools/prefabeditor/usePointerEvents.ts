import type { EventHandlers, ThreeEvent } from "@react-three/fiber";

export const NODE_INTERACTION_EVENT_TYPES = {
    onClick: "click",
    onContextMenu: "contextmenu",
    onDoubleClick: "doubleclick",
    onWheel: "wheel",
    onPointerDown: "pointerdown",
    onPointerUp: "pointerup",
    onPointerOver: "pointerover",
    onPointerOut: "pointerout",
    onPointerEnter: "pointerenter",
    onPointerLeave: "pointerleave",
    onPointerMove: "pointermove",
    onPointerCancel: "pointercancel",
    onLostPointerCapture: "lostpointercapture",
} as const;

export type NodeInteractionHandlerName = keyof typeof NODE_INTERACTION_EVENT_TYPES;
export type NodeInteractionEventType = typeof NODE_INTERACTION_EVENT_TYPES[NodeInteractionHandlerName];
export type NodeInteractionEvent = ThreeEvent<MouseEvent | PointerEvent | WheelEvent>;
export type NodeInteractionHandlers = Pick<EventHandlers, NodeInteractionHandlerName>;
export type PointerHandler<T> = (event: NodeInteractionEvent, node: T) => void;
export type PointerEventHandlers<T> = Partial<Record<NodeInteractionHandlerName, PointerHandler<T>>>;

export const NODE_INTERACTION_HANDLER_NAMES = Object.keys(
    NODE_INTERACTION_EVENT_TYPES,
) as NodeInteractionHandlerName[];

export interface UsePointerEventsOptions<T> extends PointerEventHandlers<T> {
    enabled: boolean;
    node: T | null | undefined;
}

export function hasPointerEventHandlers<T>(handlers: PointerEventHandlers<T>) {
    return NODE_INTERACTION_HANDLER_NAMES.some(name => Boolean(handlers[name]));
}

export function createNodeInteractionHandlers(
    handler: (eventType: NodeInteractionEventType, event: NodeInteractionEvent) => void,
): NodeInteractionHandlers {
    return {
        onClick: event => handler(NODE_INTERACTION_EVENT_TYPES.onClick, event),
        onContextMenu: event => handler(NODE_INTERACTION_EVENT_TYPES.onContextMenu, event),
        onDoubleClick: event => handler(NODE_INTERACTION_EVENT_TYPES.onDoubleClick, event),
        onWheel: event => handler(NODE_INTERACTION_EVENT_TYPES.onWheel, event),
        onPointerDown: event => handler(NODE_INTERACTION_EVENT_TYPES.onPointerDown, event),
        onPointerUp: event => handler(NODE_INTERACTION_EVENT_TYPES.onPointerUp, event),
        onPointerOver: event => handler(NODE_INTERACTION_EVENT_TYPES.onPointerOver, event),
        onPointerOut: event => handler(NODE_INTERACTION_EVENT_TYPES.onPointerOut, event),
        onPointerEnter: event => handler(NODE_INTERACTION_EVENT_TYPES.onPointerEnter, event),
        onPointerLeave: event => handler(NODE_INTERACTION_EVENT_TYPES.onPointerLeave, event),
        onPointerMove: event => handler(NODE_INTERACTION_EVENT_TYPES.onPointerMove, event),
        onPointerCancel: event => handler(NODE_INTERACTION_EVENT_TYPES.onPointerCancel, event),
        onLostPointerCapture: event => handler(NODE_INTERACTION_EVENT_TYPES.onLostPointerCapture, event),
    };
}

export function usePointerEvents<T>({
    enabled,
    node,
    onClick,
    onPointerDown,
    onPointerUp,
    onPointerMove,
    onPointerEnter,
    onPointerLeave,
    onPointerOver,
    onPointerOut,
    onPointerCancel,
    onContextMenu,
    onDoubleClick,
    onWheel,
    onLostPointerCapture,
}: UsePointerEventsOptions<T>): NodeInteractionHandlers {
    if (!enabled) {
        return {};
    }

    const forward = (handler?: PointerHandler<T>) => {
        if (!handler) return undefined;

        return (event: NodeInteractionEvent) => {
            event.stopPropagation();
            if (!node) return;
            handler(event, node);
        };
    };

    const forwardMove = onPointerMove
        ? (event: NodeInteractionEvent) => {
            event.stopPropagation();
            if (!node) return;
            onPointerMove(event, node);
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
        onPointerCancel: forward(onPointerCancel),
        onContextMenu: forward(onContextMenu),
        onDoubleClick: forward(onDoubleClick),
        onWheel: forward(onWheel),
        onLostPointerCapture: forward(onLostPointerCapture),
    };
}

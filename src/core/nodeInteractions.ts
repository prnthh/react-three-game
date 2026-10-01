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


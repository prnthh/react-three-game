/** Shared type contracts. React/R3F implementations live in runtime/scene. */
import type { RootState } from '@react-three/fiber';
import type { Object3D } from 'three';

export interface PrefabRegistry {
    registerObject(id: string, object: Object3D | null): () => void;
    subscribeObject(id: string, listener: () => void): () => void;
    getObject(id: string): Object3D | null;
}

declare const NODE_COMPONENT_VALUE: unique symbol;
export type NodeComponentType<T> = symbol & { readonly [NODE_COMPONENT_VALUE]?: T };

/** Live state only: changes are neither serialized nor undoable. Reads follow mounting, replacement and unloading. */
export interface GameObjectHandle {
    /** Scene-wide game-object identity, independent of the Three object UUID. */
    readonly id: string;
    readonly nodeId: string;
    readonly scope: string;
    readonly transform: Object3D | null;
    /** First live registration of this type on the node, or null. */
    getComponent<T>(type: NodeComponentType<T>): T | null;
}

/** Runtime objects for one prefab instance; authored edits use PrefabDocumentApi. */
export interface PrefabApi extends PrefabRegistry {
    root: Object3D | null;
    basePath: string;
}

export type GameEventHandler<TPayload = unknown> = (payload: TPayload) => void;

export type ContactEventPayload = {
    sourceEntityId?: string;
    sourceNodeId?: string;
    sourceObject?: Object3D;
    targetEntityId?: string | null;
    targetNodeId?: string | null;
    targetObject?: Object3D;
    collisionNormal?: [number, number, number];
    event?: unknown;
};

export type NodePointerEventPayload = {
    sourceEntityId?: string;
    sourceNodeId?: string;
    instanceEntityId?: string;
    nodeId?: string;
    node?: unknown;
    object?: unknown;
    point?: [number, number, number];
    button?: number;
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    r3fEvent?: unknown;
};

export interface GameEventMap {
    'sensor:enter': ContactEventPayload;
    'sensor:exit': ContactEventPayload;
    'collision:enter': ContactEventPayload;
    'collision:exit': ContactEventPayload;
    click: NodePointerEventPayload;
    contextmenu: NodePointerEventPayload;
    doubleclick: NodePointerEventPayload;
    wheel: NodePointerEventPayload;
    pointerdown: NodePointerEventPayload;
    pointerup: NodePointerEventPayload;
    pointerover: NodePointerEventPayload;
    pointerout: NodePointerEventPayload;
    pointerenter: NodePointerEventPayload;
    pointerleave: NodePointerEventPayload;
    pointermove: NodePointerEventPayload;
    pointercancel: NodePointerEventPayload;
    lostpointercapture: NodePointerEventPayload;
    [eventType: string]: unknown;
}

export interface GameEvents {
    emit<TType extends string>(type: TType, payload: TType extends keyof GameEventMap ? GameEventMap[TType] : unknown): void;
    on<TType extends string>(type: TType, handler: GameEventHandler<TType extends keyof GameEventMap ? GameEventMap[TType] : unknown>): () => void;
    clear(): void;
    hasListeners(type: string): boolean;
}

export interface ComponentContext<P extends object = Record<string, unknown>> {
    readonly three: RootState;
    readonly events: GameEvents;
    readonly nodeId: string;
    readonly node: GameObjectHandle;
    readonly object: Object3D | null;
    readonly prefab: PrefabApi;
    readonly properties: Required<P>;
    /** Fresh on each activation. Never serialized into the document. */
    readonly state: Record<string, any>;
    /** R3F frame delta in seconds; zero outside update. */
    readonly delta: number;
    /** Register activation-owned resources. Cleanup runs in reverse order. */
    onCleanup(cleanup: () => void): void;
}


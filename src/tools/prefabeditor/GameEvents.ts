import type { Object3D } from 'three';
import type { ShadowLight } from '../../runtime/lighting/shadowUpdates';

import { createContext, createElement, useContext, useCallback, useEffect, useState, type ReactNode } from 'react';

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
    'shadows:invalidate': { lights?: readonly ShadowLight[]; };
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

export function createGameEvents() {
    const subscribers = new Map<string, Set<GameEventHandler>>();
    return {
        emit<TType extends string>(type: TType, payload: TType extends keyof GameEventMap ? GameEventMap[TType] : unknown) {
            const trimmedType = type.trim();
            if (!trimmedType) return;

            const handlers = subscribers.get(trimmedType);
            if (!handlers) return;

            handlers.forEach(handler => {
                try {
                    handler(payload);
                } catch (error) {
                    console.error(`Error in gameEvents handler for ${trimmedType}:`, error);
                }
            });
        },

        on<TType extends string>(type: TType, handler: GameEventHandler<TType extends keyof GameEventMap ? GameEventMap[TType] : unknown>) {
            const trimmedType = type.trim();
            if (!trimmedType) {
                return () => { };
            }

            let handlers = subscribers.get(trimmedType);
            if (!handlers) {
                handlers = new Set();
                subscribers.set(trimmedType, handlers);
            }

            handlers.add(handler as GameEventHandler);

            return () => {
                const currentHandlers = subscribers.get(trimmedType);
                if (!currentHandlers) return;

                currentHandlers.delete(handler as GameEventHandler);
                if (currentHandlers.size === 0) {
                    subscribers.delete(trimmedType);
                }
            };
        },

        clear() {
            subscribers.clear();
        },

        hasListeners(type: string) {
            return (subscribers.get(type.trim())?.size ?? 0) > 0;
        },
    };

}

export type GameEvents = ReturnType<typeof createGameEvents>;
const GameEventsContext = createContext<GameEvents | null>(null);

/** Place above the canvas when HTML UI also needs access to game events. */
export function GameEventsProvider({ children }: { children: ReactNode; }) {
    const inherited = useContext(GameEventsContext);
    if (inherited) return children;
    return createElement(GameEventsOwner, null, children);
}

function GameEventsOwner({ children }: { children?: ReactNode; }) {
    const [events] = useState(createGameEvents);
    return createElement(GameEventsContext.Provider, { value: events }, children);
}

export function useGameEvents() {
    const events = useContext(GameEventsContext);
    if (!events) throw new Error('Game events require GameCanvas, PrefabRoot, or GameEventsProvider');
    return events;
}

export function useGameEvent<TType extends string>(
    type: TType,
    handler: GameEventHandler<TType extends keyof GameEventMap ? GameEventMap[TType] : unknown>,
    deps: React.DependencyList = [],
) {
    const gameEvents = useGameEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stableHandler = useCallback(handler, deps);

    useEffect(() => {
        return gameEvents.on(type, stableHandler);
    }, [gameEvents, type, stableHandler]);
}

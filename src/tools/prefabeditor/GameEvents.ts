import { useCallback, useEffect } from 'react';

export type GameEventHandler<TPayload = unknown> = (payload: TPayload) => void;

export type ContactEventPayload = {
    sourceEntityId?: string;
    sourceNodeId?: string;
    sourceObject?: unknown;
    targetEntityId?: string | null;
    targetNodeId?: string | null;
    targetObject?: unknown;
    event?: unknown;
};

export type ClickEventPayload = {
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
    click: ClickEventPayload;
    [eventType: string]: unknown;
}

const subscribers = new Map<string, Set<GameEventHandler>>();

export const gameEvents = {
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
            return () => {};
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

export function useGameEvent<TType extends string>(
    type: TType,
    handler: GameEventHandler<TType extends keyof GameEventMap ? GameEventMap[TType] : unknown>,
    deps: React.DependencyList = [],
) {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stableHandler = useCallback(handler, deps);

    useEffect(() => {
        return gameEvents.on(type, stableHandler);
    }, [type, stableHandler]);
}

export function useClickEvent<TType extends string>(
    type: TType,
    handler: GameEventHandler<TType extends keyof GameEventMap ? GameEventMap[TType] : unknown>,
    deps: React.DependencyList = [],
) {
    useGameEvent(type, handler, deps);
}
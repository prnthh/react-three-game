
import { createContext, createElement, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import type { GameEventHandler, GameEventMap, GameEvents } from '../../core/componentContext.js';
export type { GameEventHandler, GameEventMap, GameEvents, ContactEventPayload, NodePointerEventPayload } from '../../core/componentContext.js';

/** Synchronous scene notifications; no simulation clock or event scheduling. */
export function createGameEvents(): GameEvents {
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

/** Subscribe once per event type; callbacks read the latest committed props. */
export function useGameEvent<TType extends string>(
    type: TType,
    handler: GameEventHandler<TType extends keyof GameEventMap ? GameEventMap[TType] : unknown>,
) {
    const gameEvents = useGameEvents();
    const latest = useRef(handler);
    useLayoutEffect(() => { latest.current = handler; }, [handler]);
    useEffect(() => gameEvents.on(type, payload => latest.current(payload)), [gameEvents, type]);
}

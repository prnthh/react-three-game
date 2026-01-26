import { useEffect, useCallback } from 'react';
import type { RapierRigidBody } from '@react-three/rapier';

// ============================================================================
// Built-in Event Types & Payloads
// ============================================================================

/** Physics event types (built-in) */
export type PhysicsEventType =
    | 'sensor:enter'
    | 'sensor:exit'
    | 'collision:enter'
    | 'collision:exit';

/** Payload for physics events */
export interface PhysicsEventPayload {
    sourceEntityId: string;
    targetEntityId: string | null;
    targetRigidBody: RapierRigidBody | null | undefined;
}

// ============================================================================
// Event Type Registry - Maps event names to their payload types
// ============================================================================

/**
 * Register your custom event types here by extending this interface:
 *
 * declare module 'react-three-game' {
 *   interface GameEventMap {
 *     'player:death': { playerId: string; cause: string };
 *     'score:change': { delta: number; total: number };
 *   }
 * }
 */
export interface GameEventMap {
    'sensor:enter': PhysicsEventPayload;
    'sensor:exit': PhysicsEventPayload;
    'collision:enter': PhysicsEventPayload;
    'collision:exit': PhysicsEventPayload;
}

/** All registered event types */
export type GameEventType = keyof GameEventMap | (string & {});

/** Get payload type for an event, or fallback to generic */
export type GameEventPayload<T extends string> = T extends keyof GameEventMap
    ? GameEventMap[T]
    : Record<string, unknown>;

// ============================================================================
// Event System Implementation
// ============================================================================

type EventHandler<T = unknown> = (payload: T) => void;

// Internal subscriber storage
const subscribers = new Map<string, Set<EventHandler<any>>>();

/**
 * Game event system for all game interactions.
 *
 * Built-in physics events:
 * - sensor:enter - Something entered a sensor collider
 * - sensor:exit - Something exited a sensor collider
 * - collision:enter - A collision started
 * - collision:exit - A collision ended
 *
 * Custom events:
 * - Emit any event type with any payload
 * - Extend GameEventMap interface for type safety
 *
 * @example
 * // Physics events (typed)
 * gameEvents.emit('sensor:enter', { sourceEntityId: 'zone', targetEntityId: 'player', targetRigidBody: rb });
 *
 * // Custom events
 * gameEvents.emit('player:death', { playerId: 'p1', cause: 'lava' });
 * gameEvents.emit('level:complete', { levelId: 3, time: 45.2 });
 */
export const gameEvents = {
    /**
     * Emit an event to all subscribers
     */
    emit<T extends string>(type: T, payload: GameEventPayload<T>): void {
        const handlers = subscribers.get(type);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(payload);
                } catch (e) {
                    console.error(`Error in gameEvents handler for ${type}:`, e);
                }
            });
        }
    },

    /**
     * Subscribe to an event type
     * @returns Unsubscribe function
     */
    on<T extends string>(type: T, handler: EventHandler<GameEventPayload<T>>): () => void {
        if (!subscribers.has(type)) {
            subscribers.set(type, new Set());
        }
        subscribers.get(type)!.add(handler);

        return () => {
            subscribers.get(type)?.delete(handler);
        };
    },

    /**
     * Unsubscribe from an event type
     */
    off<T extends string>(type: T, handler: EventHandler<GameEventPayload<T>>): void {
        subscribers.get(type)?.delete(handler);
    },

    /**
     * Remove all subscribers (useful for cleanup/reset)
     */
    clear(): void {
        subscribers.clear();
    },

    /**
     * Check if an event type has any subscribers
     */
    hasListeners(type: string): boolean {
        return (subscribers.get(type)?.size ?? 0) > 0;
    }
};

/**
 * React hook to subscribe to game events.
 * Automatically cleans up on unmount.
 *
 * @example
 * // Physics event
 * useGameEvent('sensor:enter', (payload) => {
 *   if (payload.sourceEntityId === 'coin') collectCoin();
 * }, []);
 *
 * // Custom event
 * useGameEvent('player:death', (payload) => {
 *   showGameOver(payload.cause);
 * }, []);
 */
export function useGameEvent<T extends string>(
    type: T,
    handler: EventHandler<GameEventPayload<T>>,
    deps: unknown[] = []
): void {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stableHandler = useCallback(handler, deps);

    useEffect(() => {
        return gameEvents.on(type, stableHandler);
    }, [type, stableHandler]);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Helper to extract entity ID from Rapier collision data.
 * Entity IDs are stored in RigidBody userData.
 */
export function getEntityIdFromRigidBody(rigidBody: RapierRigidBody | null | undefined): string | null {
    if (!rigidBody) return null;
    const userData = rigidBody.userData as { entityId?: string } | undefined;
    return userData?.entityId ?? null;
}

// ============================================================================
// Backward Compatibility Aliases
// ============================================================================

/** @deprecated Use gameEvents instead */
export const entityEvents = gameEvents;

/** @deprecated Use useGameEvent instead */
export const useEntityEvent = useGameEvent;

/** @deprecated Use GameEventType instead */
export type EntityEventType = PhysicsEventType;

/** @deprecated Use PhysicsEventPayload instead */
export type EntityEventPayload = PhysicsEventPayload;

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

export type InteractionEventType = 'click';

/** Payload for physics events */
export interface PhysicsEventPayload {
    sourceEntityId: string;
    targetEntityId: string | null;
    targetRigidBody: RapierRigidBody | null | undefined;
}

export interface ClickEventPayload {
    sourceEntityId: string;
    instanceEntityId?: string;
    point: [number, number, number];
    button: number;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
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
    'click': ClickEventPayload;
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

type UnknownEventPayload = Record<string, unknown>;

// Internal subscriber storage
const subscribers = new Map<string, Set<EventHandler<any>>>();

function emitGameEvent<TType extends keyof GameEventMap>(type: TType, payload: GameEventMap[TType]): void;
function emitGameEvent(type: string, payload: UnknownEventPayload): void;
function emitGameEvent(type: string, payload: UnknownEventPayload): void {
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
}

function onGameEvent<TType extends keyof GameEventMap>(
    type: TType,
    handler: EventHandler<GameEventMap[TType]>
): () => void;
function onGameEvent(type: string, handler: EventHandler<UnknownEventPayload>): () => void;
function onGameEvent(type: string, handler: EventHandler<any>): () => void {
    if (!subscribers.has(type)) {
        subscribers.set(type, new Set());
    }
    subscribers.get(type)!.add(handler);

    return () => {
        subscribers.get(type)?.delete(handler);
    };
}

function offGameEvent<TType extends keyof GameEventMap>(
    type: TType,
    handler: EventHandler<GameEventMap[TType]>
): void;
function offGameEvent(type: string, handler: EventHandler<UnknownEventPayload>): void;
function offGameEvent(type: string, handler: EventHandler<any>): void {
    subscribers.get(type)?.delete(handler);
}

function useTypedGameEvent(
    type: string,
    handler: EventHandler<any>,
    deps: unknown[] = []
): void {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stableHandler = useCallback(handler, deps);

    useEffect(() => {
        return onGameEvent(type, stableHandler);
    }, [type, stableHandler]);
}

/**
 * Game event system for all game interactions.
 *
 * Built-in events:
 * - sensor:enter - Something entered a sensor collider
 * - sensor:exit - Something exited a sensor collider
 * - collision:enter - A collision started
 * - collision:exit - A collision ended
 * - click - A prefab entity with a Click component was clicked in play mode
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
    emit: emitGameEvent,

    /**
     * Subscribe to an event type
     * @returns Unsubscribe function
     */
    on: onGameEvent,

    /**
     * Unsubscribe from an event type
     */
    off: offGameEvent,

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
 *   const cause = typeof payload.cause === 'string' ? payload.cause : 'unknown';
 *   showGameOver(cause);
 * }, []);
 */
export function useGameEvent<TType extends keyof GameEventMap>(
    type: TType,
    handler: EventHandler<GameEventMap[TType]>,
    deps?: unknown[]
): void;
export function useGameEvent(type: string, handler: EventHandler<UnknownEventPayload>, deps?: unknown[]): void;
export function useGameEvent(
    type: string,
    handler: EventHandler<any>,
    deps: unknown[] = []
): void {
    useTypedGameEvent(type, handler, deps);
}

/**
 * React hook to subscribe to any physics event payload.
 * Use this when the event name is dynamic but the payload comes from PhysicsComponent.
 */
export function usePhysicsEvent(
    type: string,
    handler: EventHandler<PhysicsEventPayload>,
    deps: unknown[] = []
): void {
    useTypedGameEvent(type, handler, deps);
}

/**
 * React hook to subscribe to click event payloads.
 * Use this when the event name is dynamic but the payload comes from ClickComponent.
 */
export function useClickEvent(
    type: string,
    handler: EventHandler<ClickEventPayload>,
    deps: unknown[] = []
): void {
    useTypedGameEvent(type, handler, deps);
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


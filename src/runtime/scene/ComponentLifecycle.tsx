import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree, type RootState } from '@react-three/fiber';
import type { Object3D } from 'three';
import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';
import { useGameObject, useNode, usePrefab, type PrefabApi } from './SceneContext.js';
import { useGameEvents, type GameEvents } from './GameEvents.js';
import type { GameObjectHandle } from './gameObject.js';

/** A live mapping onto R3F, not another renderer, clock, or scene store. */
export interface SceneRuntimeContext {
    readonly three: RootState;
    readonly events: GameEvents;
}

export function useSceneRuntimeContext(): SceneRuntimeContext {
    const get = useThree(state => state.get);
    const events = useGameEvents();
    return useMemo(() => ({ get three() { return get(); }, events }), [get, events]);
}

export interface ComponentContext<P extends object = Record<string, unknown>> extends SceneRuntimeContext {
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

/** @internal Optional effect/frame adapter. Views can own their behavior through React/R3F hooks. */
export function ComponentHost<P extends object>({ component, properties, enabled, children }: ComponentViewProps<P> & {
    component: Component<P>;
}) {
    const View = component.View;
    const content = View ? <View properties={properties} enabled={enabled}>{children}</View> : children;
    return component.setup || component.update
        ? <Lifecycle component={component} properties={properties} enabled={enabled}>{content}</Lifecycle>
        : content;
}

function Lifecycle<P extends object>({ component, properties, enabled, children }: ComponentViewProps<P> & {
    component: Component<P>; children?: ReactNode;
}) {
    const scene = useSceneRuntimeContext();
    const node = useGameObject();
    const prefab = usePrefab();
    const { nodeId, editMode, preparing } = useNode();
    const active = enabled && !editMode && !preparing;
    const latest = useRef(properties);
    useLayoutEffect(() => { latest.current = properties; }, [properties]);
    const frame = useRef<((delta: number) => void) | null>(null);
    // Compare restart inputs without a variable-length effect dependency array.
    const values = (component.restartOn ?? []).map(key => properties[key]);
    const restart = useRef({ values, token: {} });
    if (values.length !== restart.current.values.length || values.some((value, index) => !Object.is(value, restart.current.values[index]))) {
        restart.current = { values, token: {} };
    }
    const token = restart.current.token;
    useEffect(() => {
        if (!active) return;
        const cleanups: (() => void)[] = [];
        let disposed = false;
        let delta = 0;
        const report = (phase: string, error: unknown) => console.error(`${component.name} component on node "${node.id}" (${phase}):`, error);
        const context: ComponentContext<P> = {
            get three() { return scene.three; }, events: scene.events,
            nodeId, node, prefab, get object() { return node.transform; },
            get properties() { return latest.current as Required<P>; },
            state: {}, get delta() { return delta; },
            onCleanup(cleanup) {
                if (disposed) { try { cleanup(); } catch (error) { report('cleanup', error); } }
                else cleanups.push(cleanup);
            },
        };
        const dispose = () => {
            if (disposed) return;
            disposed = true;
            frame.current = null;
            for (const cleanup of cleanups.reverse()) {
                try { cleanup(); } catch (error) { report('cleanup', error); }
            }
        };
        try {
            const cleanup = component.setup?.(context);
            if (cleanup) context.onCleanup(cleanup);
            frame.current = component.update ? duration => {
                delta = duration;
                try { component.update!(context); }
                catch (error) { delta = 0; report('update', error); dispose(); }
                finally { delta = 0; }
            } : null;
        } catch (error) { report('setup', error); dispose(); }
        return dispose;
    }, [active, component, nodeId, node, prefab, scene, token]);
    // Negative priority preserves R3F's render ownership and precedes instance uploads.
    useFrame((_, delta) => { if (active) frame.current?.(delta); }, -1);
    return children;
}

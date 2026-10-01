import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Object3D } from 'three';
import { useGameObject, useNode, usePrefab, type PrefabApi } from '../scene/SceneContext';
import { useGameEvents, type GameEvents } from '../scene/GameEvents';
import type { GameObjectHandle } from '../scene/gameObject';
import type { Component, ComponentViewProps } from '../../core/ComponentRegistry';

export type RuntimeComponentProperties = {
    data?: Record<string, unknown>;
    setup?: string;
    update?: string;
};

export interface RuntimeScriptContext {
    /** Local document ID, usable with prefab.get/update/remove. */
    nodeId: string;
    node: GameObjectHandle;
    readonly object: Object3D | null;
    /** Instance-local copy of authored data, refreshed without restarting setup. */
    readonly data: Record<string, unknown>;
    /** Mutable state shared by setup and update; fresh for each effect setup. */
    state: Record<string, any>;
    prefab: PrefabApi;
    events: GameEvents;
    /** Frame duration in seconds; zero outside update. */
    delta: number;
}

type Script = (context: RuntimeScriptContext) => unknown;
function compile(source: string): Script {
    return new Function('context',
        '"use strict"; const { nodeId, node, object, data, state, prefab, events, delta } = context;\n' + source,
    ) as Script;
}

function RuntimeView({ properties, enabled, children }: ComponentViewProps<RuntimeComponentProperties>) {
    const node = useGameObject();
    const prefab = usePrefab();
    const events = useGameEvents();
    const { nodeId, editMode, preparing } = useNode();
    const active = enabled && !editMode && !preparing;
    const { setup, update, data } = properties;
    const inputs = useRef<Record<string, unknown>>({});
    const updateFrame = useRef<((delta: number) => void) | null>(null);

    useEffect(() => {
        inputs.current = structuredClone(data);
    }, [data]);

    useEffect(() => {
        if (!active) return;
        const context: RuntimeScriptContext = {
            nodeId, node, get object() { return node.transform; },
            get data() { return inputs.current; },
            state: {}, prefab, events, delta: 0,
        };
        const report = (field: string, error: unknown) =>
            console.error(`Runtime component on node "${node.id}" (${field}):`, error);
        let field = 'setup';
        let cleanup: unknown;
        try {
            const runSetup = compile(setup);
            field = 'update';
            const runUpdate = compile(update);
            field = 'setup';
            cleanup = runSetup(context);
            updateFrame.current = delta => {
                context.delta = delta;
                try { runUpdate(context); }
                catch (error) {
                    updateFrame.current = null;
                    report('update', error);
                } finally { context.delta = 0; }
            };
        } catch (error) { report(field, error); }
        return () => {
            updateFrame.current = null;
            if (typeof cleanup === 'function') {
                try { cleanup(); }
                catch (error) { report('cleanup', error); }
            }
        };
    }, [active, nodeId, node, prefab, events, setup, update]);

    useFrame((_, delta) => {
        if (active) updateFrame.current?.(delta);
    });
    return <>{children}</>;
}

const RuntimeComponent: Component<RuntimeComponentProperties> = {
    name: 'Runtime',
    description: 'Run trusted JavaScript using a React effect (setup with returned cleanup) and an R3F frame callback (update).',
    renderWhenDisabled: true,
    View: RuntimeView,
    properties: {
        data: { type: 'object', default: {}, description: 'JSON input copied into this instance; changes do not restart setup.' },
        setup: { type: 'string', default: '', description: 'Effect body while enabled in Play mode. Return cleanup for disable, removal or code changes. Must tolerate repeated setup/cleanup.' },
        update: { type: 'string', default: '', description: 'Frame callback while enabled in Play mode; delta is seconds. Shares state with setup.' },
    },
};
export default RuntimeComponent;

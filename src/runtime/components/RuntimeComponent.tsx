import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';
import type { ComponentContext } from '../../core/componentContext.js';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGameObject, useNode, usePrefab } from '../scene/SceneContext.js';
import { useGameEvents } from '../scene/GameEvents.js';
import { useComponentActive } from '../scene/useComponentActive.js';

export type RuntimeComponentProperties = {
    data?: Record<string, unknown>;
    setup?: string;
    update?: string;
};

export interface RuntimeScriptContext extends ComponentContext<RuntimeComponentProperties> {
    /** Instance-local copy of authored data, refreshed without restarting setup. */
    readonly data: Record<string, unknown>;
}

type Script = (context: RuntimeScriptContext) => unknown;
function compile(source: string): Script {
    return new Function('context',
        '"use strict"; const { nodeId, node, object, data, state, prefab, events, delta, three } = context;\n' + source,
    ) as Script;
}

/** Script execution is local to this View; the prefab renderer only composes Views. */
function RuntimeView({ properties, enabled, children }: ComponentViewProps<RuntimeComponentProperties>) {
    const getThree = useThree(state => state.get);
    const events = useGameEvents();
    const node = useGameObject();
    const prefab = usePrefab();
    const nodeId = useNode(node => node.nodeId);
    const active = useComponentActive(enabled);
    const latest = useRef(properties);
    const frame = useRef<((delta: number) => void) | null>(null);
    useLayoutEffect(() => { latest.current = properties; });
    const { setup, update } = properties;
    useEffect(() => {
        if (!active) return;
        const cleanups: (() => void)[] = [];
        let disposed = false, delta = 0;
        let source: Record<string, unknown> | undefined;
        let data: Record<string, unknown> = {};
        const report = (phase: string, error: unknown) => console.error(`Runtime component on node "${node.id}" (${phase}):`, error);
        const context: RuntimeScriptContext = {
            get three() { return getThree(); }, events,
            nodeId, node, prefab, get object() { return node.transform; },
            get properties() { return latest.current; },
            get data() {
                if (source !== latest.current.data) {
                    source = latest.current.data;
                    data = structuredClone(source ?? {});
                }
                return data;
            },
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
            const runSetup = compile(setup), runUpdate = compile(update);
            const cleanup = runSetup(context);
            if (typeof cleanup === 'function') context.onCleanup(cleanup as () => void);
            frame.current = duration => {
                delta = duration;
                try { runUpdate(context); }
                catch (error) { delta = 0; report('update', error); dispose(); }
                finally { delta = 0; }
            };
        } catch (error) { report('setup', error); dispose(); }
        return dispose;
    }, [active, setup, update, nodeId, node, prefab, getThree, events]);
    // Run scripts before default frame consumers without taking over rendering.
    useFrame((_, delta) => { if (active) frame.current?.(delta); }, -1);
    return children;
}

const RuntimeComponent: Component<RuntimeComponentProperties> = {
    name: 'Runtime',
    category: 'misc',
    renderWhenDisabled: true,
    description: "Run JavaScript on this node in Play. Example properties: {\"data\":{\"speed\":2},\"update\":\"if (object) object.position.x += data.speed * delta;\"}. Bodies receive context and aliases nodeId, node, object, data, state, prefab, events, delta, three; do not redeclare these names.",
    View: RuntimeView,
    properties: {
        data: { description: "JSON inputs, copied per Runtime instance. Read data.speed in update or context.data.speed in a retained callback. Editing data does not restart setup.", type: 'object', default: {} },
        setup: { description: "JavaScript body run on entry to Play or re-enable; state starts empty. Example: return events.on(\"jump\", () => { const o = context.object; if (o) o.position.y += 1; }); Return cleanup or call context.onCleanup(fn). Cleanup runs on disable, exit from Play, removal or code edits. Setup follows committed object refs; separately loading objects may still be absent.", type: 'string', default: '' },
        update: { description: "JavaScript body run each R3F frame after setup. delta is seconds; state persists between frames. object is this node transform; prefab.getObject(\"id\") returns a live object in this prefab instance or null. Read context.three.camera, .scene or .gl for current R3F state. Object changes are live, not saved document edits.", type: 'string', default: '' },
    },
};
export default RuntimeComponent;

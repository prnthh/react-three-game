import type { Component } from '../../core/ComponentRegistry.js';
import type { ComponentContext } from '../scene/ComponentLifecycle.js';

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
const scripts = new WeakMap<ComponentContext<RuntimeComponentProperties>, { script: RuntimeScriptContext; runUpdate: Script }>();
function compile(source: string): Script {
    return new Function('context',
        '"use strict"; const { nodeId, node, object, data, state, prefab, events, delta, three } = context;\n' + source,
    ) as Script;
}

const RuntimeComponent: Component<RuntimeComponentProperties> = {
    name: 'Runtime',
    description: "Run JavaScript on this node in Play. Example properties: {\"data\":{\"speed\":2},\"update\":\"if (object) object.position.x += data.speed * delta;\"}. Bodies receive context and aliases nodeId, node, object, data, state, prefab, events, delta, three; do not redeclare these names.",
    renderWhenDisabled: true,
    restartOn: ['setup', 'update'],
    setup(context) {
        const runSetup = compile(context.properties.setup);
        const runUpdate = compile(context.properties.update);
        let source: Record<string, unknown> | undefined;
        let data: Record<string, unknown> = {};
        const script: RuntimeScriptContext = Object.create(context, {
            data: { get() {
                if (source !== context.properties.data) {
                    source = context.properties.data;
                    data = structuredClone(source ?? {});
                }
                return data;
            } },
        });
        scripts.set(context, { script, runUpdate });
        context.onCleanup(() => scripts.delete(context));
        const cleanup = runSetup(script);
        if (typeof cleanup === 'function') return cleanup as () => void;
    },
    update(context) {
        const entry = scripts.get(context);
        if (entry) entry.runUpdate(entry.script);
    },
    properties: {
        data: { description: "JSON inputs, copied per Runtime instance. Read data.speed in update or context.data.speed in a retained callback. Editing data does not restart setup.", type: 'object', default: {} },
        setup: { description: "JavaScript body run on entry to Play or re-enable; state starts empty. Example: return events.on(\"jump\", () => { const o = context.object; if (o) o.position.y += 1; }); Return cleanup or call context.onCleanup(fn). Cleanup runs on disable, exit from Play, removal or code edits. Setup follows committed object refs; separately loading objects may still be absent.", type: 'string', default: '' },
        update: { description: "JavaScript body run each R3F frame after setup. delta is seconds; state persists between frames. object is this node transform; prefab.getObject(\"id\") returns a live object in this prefab instance or null. Read context.three.camera, .scene or .gl for current R3F state. Object changes are live, not saved document edits.", type: 'string', default: '' },
    },
};
export default RuntimeComponent;

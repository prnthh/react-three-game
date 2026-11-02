import type { SceneAgent } from './sceneAgent.js';
import { createSceneTools, type SceneTool } from './sceneTools.js';

/** Current WebMCP draft: https://webmachinelearning.github.io/webmcp/
 * Native registration is document.modelContext; no relay or injected polyfill. */
export interface SceneModelContext {
    registerTool(tool: SceneTool, options: { signal: AbortSignal }): Promise<void>;
}
export type SceneWebMCPStatus = { state: 'inactive' | 'unavailable' | 'registering' | 'ready' | 'error'; toolCount: number; message?: string };
type Record = { status: SceneWebMCPStatus; listeners: Set<() => void>; session?: object };
const records = new WeakMap<SceneAgent, Record>();
function record(scene: SceneAgent) {
    let value = records.get(scene);
    if (!value) records.set(scene, value = { status: { state: 'inactive', toolCount: 0 }, listeners: new Set() });
    return value;
}
export const getSceneWebMCPStatus = (scene: SceneAgent) => record(scene).status;
export function subscribeSceneWebMCP(scene: SceneAgent, listener: () => void) {
    const value = record(scene); value.listeners.add(listener);
    return () => { value.listeners.delete(listener); };
}

/** Registration lifetime matches one mounted editor. Abort unregisters only
 * this session's tools; failures roll back partial registration. */
export function registerSceneWebMCP(scene: SceneAgent, document: object) {
    const value = record(scene), session = {};
    value.session = session;
    const update = (status: SceneWebMCPStatus) => {
        if (value.session !== session) return;
        value.status = status; value.listeners.forEach(listener => listener());
    };
    const controller = new AbortController();
    const context = (document as { modelContext?: SceneModelContext }).modelContext;
    const tools = createSceneTools(scene);
    const ready = (async () => {
        if (!context || typeof context.registerTool !== 'function') {
            update({ state: 'unavailable', toolCount: 0 }); return;
        }
        update({ state: 'registering', toolCount: 0 });
        try {
            for (const tool of tools) {
                controller.signal.throwIfAborted();
                await context.registerTool({ ...tool,
                    execute: async (args, options = {}) => {
                        controller.signal.throwIfAborted();
                        const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
                        return tool.execute(args, { signal });
                    },
                }, { signal: controller.signal });
            }
            controller.signal.throwIfAborted();
            update({ state: 'ready', toolCount: tools.length });
        } catch (error) {
            if (controller.signal.aborted) return;
            controller.abort();
            update({ state: 'error', toolCount: 0, message: error instanceof Error ? error.message : String(error) });
        }
    })();
    return { ready, dispose() { controller.abort(); update({ state: 'inactive', toolCount: 0 }); } };
}

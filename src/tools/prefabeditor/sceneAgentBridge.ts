import { sceneRegistryHelp } from './sceneAgentHelp';
import type { SceneAgentApi } from './sceneAgent';

export interface SceneAgentRegistry {
    readonly version: 1;
    help(): typeof sceneRegistryHelp;
    readonly editors: Record<string, SceneAgentApi>;
    listEditors(): { id: string; name?: string; mode: string; revision: string }[];
}

declare global {
    interface Window { reactThreeGame?: SceneAgentRegistry }
}

/** Ordinary page JavaScript, accessible through Chrome DevTools or an embedding host. */
export function exposeSceneAgent(target: Pick<Window, 'reactThreeGame'>, id: string, api: SceneAgentApi) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || Object.hasOwn(Object.prototype, id)) throw new Error('Agent editor ID must use 1–80 letters, digits, underscores or hyphens.');
    const registry = target.reactThreeGame ??= {
        version: 1,
        help() { return structuredClone(sceneRegistryHelp); },
        editors: Object.create(null) as Record<string, SceneAgentApi>,
        listEditors() {
            return Object.entries(this.editors).map(([id, editor]) => {
                const { name, mode, revision } = editor.getSceneInfo();
                return { id, name, mode, revision };
            });
        },
    };
    if (registry.version !== 1) throw new Error('An incompatible scene agent registry already exists.');
    if (Object.hasOwn(registry.editors, id)) throw new Error(`Agent editor ID "${id}" is already mounted. Use a unique agentId.`);
    registry.editors[id] = api;
    return () => {
        if (registry.editors[id] === api) delete registry.editors[id];
        if (!Object.keys(registry.editors).length && target.reactThreeGame === registry) delete target.reactThreeGame;
    };
}

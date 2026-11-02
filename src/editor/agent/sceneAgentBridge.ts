import type { SceneAgent } from './sceneAgent.js';
import { registerSceneWebMCP } from './sceneWebMCP.js';

const announcedAgents = new WeakSet<object>();

declare global { interface Window { scene?: SceneAgent } }

/** Ordinary page JavaScript, accessible through Chrome DevTools or an embedding host. */
export function exposeSceneAgent(target: Pick<Window, 'scene'> & { document?: object }, scene: SceneAgent) {
    if (target.scene) throw new Error('Only one agent-enabled PrefabEditor is supported per page.');
    target.scene = scene;
    const registration = target.document ? registerSceneWebMCP(scene, target.document) : null;
    if (typeof window !== 'undefined' && target === window && !announcedAgents.has(scene)) {
        announcedAgents.add(scene);
        console.info('[react-three-game] Scene ready: window.scene. Start with window.scene.help().');
    }
    return () => {
        registration?.dispose();
        if (target.scene === scene) delete target.scene;
    };
}

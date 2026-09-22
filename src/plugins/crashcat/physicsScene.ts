import type { Scene } from "three";
import type { CrashcatApi } from "./CrashcatRuntime";

function createPhysicsScene() {
    let api: CrashcatApi | null = null;
    const listeners = new Set<() => void>();
    return {
        getSnapshot: () => api,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        register(value: CrashcatApi) {
            if (api) throw new Error("Only one CrashcatRuntime may own a Three.js scene");
            api = value;
            listeners.forEach(listener => listener());
            return () => {
                if (api !== value) return;
                api = null;
                listeners.forEach(listener => listener());
            };
        },
    };
}

const scenes = new WeakMap<Scene, ReturnType<typeof createPhysicsScene>>();

export function getPhysicsScene(scene: Scene) {
    let state = scenes.get(scene);
    if (!state) {
        state = createPhysicsScene();
        scenes.set(scene, state);
    }
    return state;
}

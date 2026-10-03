import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { Light, Object3D, Scene } from 'three';
import { createNodeComponentType, getSceneComponentRegistry } from './SceneContext';

export const SCENE_OBJECT = createNodeComponentType<Object3D>('scene-object');
export const SCENE_LIGHT = createNodeComponentType<Light>('scene-light');

/** Adapts Three hierarchy events to the shared component registry, including raw JSX objects. */
class SceneGraphRegistrationOwner {
    private tracked = new Map<Object3D, () => void>();
    private users = 0;
    private registry;
    constructor(private scene: Scene) { this.registry = getSceneComponentRegistry(scene); }
    private added = (event: { child: Object3D }) => this.registry.batch(() => this.track(event.child));
    private removed = (event: { child: Object3D }) => this.registry.batch(() => this.untrack(event.child));
    private track(object: Object3D) {
        if (this.tracked.has(object)) return;
        const removeObject = this.registry.register(object.uuid, SCENE_OBJECT, object);
        const removeLight = (object as Light).isLight
            ? this.registry.register(object.uuid, SCENE_LIGHT, object as Light) : undefined;
        this.tracked.set(object, () => { removeObject(); removeLight?.(); });
        object.addEventListener('childadded', this.added);
        object.addEventListener('childremoved', this.removed);
        for (const child of object.children) this.track(child);
    }
    private untrack(object: Object3D) {
        this.tracked.get(object)?.();
        this.tracked.delete(object);
        object.removeEventListener('childadded', this.added);
        object.removeEventListener('childremoved', this.removed);
        for (const child of object.children) this.untrack(child);
    }
    retain() {
        if (this.users++ === 0) this.registry.batch(() => this.track(this.scene));
        let released = false;
        return () => {
            if (released) return;
            released = true;
            if (--this.users === 0) this.registry.batch(() => this.untrack(this.scene));
        };
    }
}
const owners = new WeakMap<Scene, SceneGraphRegistrationOwner>();
export function retainSceneGraphRegistration(scene: Scene) {
    let owner = owners.get(scene);
    if (!owner) owners.set(scene, owner = new SceneGraphRegistrationOwner(scene));
    return owner.retain();
}

export function SceneGraphRegistration() {
    const scene = useThree(state => state.scene);
    useLayoutEffect(() => retainSceneGraphRegistration(scene), [scene]);
    return null;
}

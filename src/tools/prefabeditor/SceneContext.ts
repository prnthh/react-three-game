import { createContext, useContext } from "react";
import type { Object3D, Texture } from "three";
import type { GameObject, Prefab } from "./types";

export enum PrefabEditorMode {
    Edit = "edit",
    Play = "play",
}

export type PrefabNode = Omit<GameObject, "children">;

export interface Scene {
    root: Object3D | null;
    mode: PrefabEditorMode;
    basePath: string;
    get(id: string): GameObject | null;
    getObject(id: string): Object3D | null;
    getHandle<T = unknown>(id: string, kind: string): T | null;
    getModel(path: string): Object3D | null;
    add(node: GameObject, parentId?: string): GameObject;
    update(id: string, fn: (node: PrefabNode) => PrefabNode): void;
    replaceNode(id: string, node: GameObject): void;
    remove(id: string): void;
    duplicate(id: string): string | null;
    move(draggedId: string, targetId: string, position: "before" | "inside"): void;
    replace(prefab: Prefab): void;
    addModel(path: string, model: Object3D): void;
    addTexture(path: string, texture: Texture): void;
    addSound(path: string, sound: AudioBuffer): void;
}

export const SceneContext = createContext<Scene | null>(null);

export function useScene() {
    const scene = useContext(SceneContext);
    if (!scene) {
        throw new Error("useScene must be used within a PrefabRoot or PrefabEditor scene provider");
    }
    return scene;
}

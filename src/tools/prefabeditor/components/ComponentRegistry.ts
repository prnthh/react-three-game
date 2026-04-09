import { FC } from "react";
import { ComponentData, GameObject } from "../types";

export type AssetRef = { type: "model" | "texture" | "sound"; path: string };

export interface Component {
    name: string;
    Editor: FC<{
        node?: GameObject;
        component: ComponentData;
        onUpdate: (newComp: any) => void;
        basePath?: string;
    }>;
    defaultProperties: any;
    // Allow View to accept extra props for special cases (like material)
    View?: FC<any>;
    /** When true, this component wraps child entities (e.g. Physics wraps children in RigidBody). */
    isWrapper?: boolean;
    // Declare which asset paths this component references (for asset loading)
    getAssetRefs?: (properties: Record<string, any>) => AssetRef[];
}

const REGISTRY: Record<string, Component> = {};

export function registerComponent(component: Component) {
    REGISTRY[component.name] = component;
}

export function getComponentDef(name: string): Component | undefined {
    return REGISTRY[name];
}

export function getAllComponentDefs(): Record<string, Component> {
    return { ...REGISTRY };
}

export function getComponentAssetRefs(componentType: string, properties: Record<string, any>): AssetRef[] {
    const component = REGISTRY[componentType];
    return component?.getAssetRefs?.(properties) ?? [];
}

import { FC } from "react";
import { ComponentData, GameObject } from "../types";
import type { ComponentInstance, ComponentRuntimeContext } from "../runtime";

export type AssetRef = { type: "model" | "texture" | "sound"; path: string };

/** Props every component View receives from the renderer. */
export interface ComponentViewProps<P = Record<string, any>> {
    /** This component's own data from the prefab JSON. */
    properties: P;
    /** Children to render for components that wrap the current subtree. */
    children?: React.ReactNode;
    /** Entity local position (passed to wrapper components like Physics). */
    position?: [number, number, number];
    /** Entity local rotation in radians (passed to wrapper components like Physics). */
    rotation?: [number, number, number];
    /** Entity local scale (passed to wrapper components like Physics). */
    scale?: [number, number, number];
}

export interface Component {
    name: string;
    Editor: FC<{
        node?: GameObject;
        component: ComponentData;
        onUpdate: (newComp: any) => void;
        basePath?: string;
    }>;
    defaultProperties: any;
    View?: FC<ComponentViewProps>;
    /** Optional runtime factory for the non-React game loop. */
    create?: (ctx: ComponentRuntimeContext) => ComponentInstance | void;
    /** Declare which asset paths this component references (for asset loading). */
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

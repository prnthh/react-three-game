import { FC } from "react";

export interface Component {
    name: string;
    Editor: FC<{ 
        component: any; 
        onUpdate: (newComp: any) => void; 
        basePath?: string;
        transformMode?: "translate" | "rotate" | "scale";
        setTransformMode?: (m: "translate" | "rotate" | "scale") => void;
    }>;
    defaultProperties: any;
    // Allow View to accept extra props for special cases (like material)
    View?: FC<any>;
}

const REGISTRY: Record<string, Component> = {};

export function registerComponent(component: Component) {
    if (REGISTRY[component.name]) {
        throw new Error(`Component with name ${component.name} already registered.`);
    }
    REGISTRY[component.name] = component;
}

export function getComponent(name: string): Component | undefined {
    return REGISTRY[name];
}

export function getAllComponents(): Record<string, Component> {
    return { ...REGISTRY };
}

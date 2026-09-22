import type { ComponentData, GameObject as GameObjectType } from "./types";
import { getComponent, getComponentRegistryVersion, resolveComponentProperties, type Component } from "./components/ComponentRegistry";

type CompositionComponent = {
    key: string;
    View: NonNullable<Component["View"]>;
    properties: ComponentData["properties"];
    order: number;
    renderWhenDisabled: boolean;
};

type AnalyzedNodeComponents = {
    clickEvent: ClickEventConfig;
    composition: CompositionComponent[];
    transform: {
        position: [number, number, number];
        rotation: [number, number, number];
        scale: [number, number, number];
    };
};

type ClickEventConfig = {
    enabled: boolean;
    eventName: string | null;
};

export const EMPTY_NODE_COMPONENTS: AnalyzedNodeComponents = {
    clickEvent: { enabled: false, eventName: null },
    composition: [],
    transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
    },
};

const cache = new WeakMap<GameObjectType, { version: number; plan: AnalyzedNodeComponents }>();
export function analyzeNodeComponents(node: GameObjectType): AnalyzedNodeComponents {
    const version = getComponentRegistryVersion();
    const cached = cache.get(node);
    if (cached?.version === version) return cached.plan;

    const componentMap = node.components ?? {};
    const composition: CompositionComponent[] = [];
    let clickEvent: ClickEventConfig = EMPTY_NODE_COMPONENTS.clickEvent;
    let transform = EMPTY_NODE_COMPONENTS.transform;

    for (const [key, component] of Object.entries(componentMap)) {
        if (!component?.type) continue;
        const registeredComponent = getComponent(component.type);
        const properties = resolveComponentProperties(registeredComponent, component.properties);

        if (component.type === "Transform") {
            transform = {
                position: properties.position ?? [0, 0, 0],
                rotation: properties.rotation ?? [0, 0, 0],
                scale: properties.scale ?? [1, 1, 1],
            };
            continue;
        }
        if (!registeredComponent?.View) continue;

        composition.push({
            key,
            View: registeredComponent.View,
            properties,
            order: registeredComponent.slot === 'geometry' || registeredComponent.slot === 'material'
                ? 2 : registeredComponent.slot === 'object' ? 1 : 0,
            renderWhenDisabled: registeredComponent.renderWhenDisabled === true,
        });

        if (!clickEvent.enabled && 'emitClickEvent' in registeredComponent.properties && properties.emitClickEvent) {
            const eventName = properties.clickEventName;
            clickEvent = {
                enabled: true,
                eventName: typeof eventName === 'string' && eventName.trim() ? eventName.trim() : null,
            };
        }
    }

    composition.sort((left, right) => left.order - right.order);

    const value = {
        clickEvent,
        composition,
        transform,
    };
    cache.set(node, { version, plan: value });
    return value;
}


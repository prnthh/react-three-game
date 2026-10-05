import { MeshNode } from "../rendering/MeshNode.js";
import { createContext } from 'react';
import type { ComponentData, GameObject as GameObjectType } from "../../core/types.js";
import { getComponent, resolveComponentProperties, type Component } from "../../core/ComponentRegistry.js";

/** A host can use engine definitions without changing the application's registry. */
export const ComponentLookupContext = createContext(getComponent);

type CompositionComponent = {
    key: string;
    View?: Component["View"];
    component?: Component;
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

export function analyzeNodeComponents(node: GameObjectType, lookup = getComponent): AnalyzedNodeComponents {
    const componentMap = node.components ?? {};
    const composition: CompositionComponent[] = [];
    let clickEvent: ClickEventConfig = EMPTY_NODE_COMPONENTS.clickEvent;
    let transform = EMPTY_NODE_COMPONENTS.transform;

    for (const [key, component] of Object.entries(componentMap)) {
        if (!component?.type) continue;
        const registeredComponent = lookup(component.type);
        const properties = resolveComponentProperties(registeredComponent, component.properties);

        if (component.type === "Transform") {
            transform = {
                position: properties.position ?? [0, 0, 0],
                rotation: properties.rotation ?? [0, 0, 0],
                scale: properties.scale ?? [1, 1, 1],
            };
        }
        if (!registeredComponent || !(registeredComponent.View || registeredComponent.setup || registeredComponent.update)) continue;

        composition.push({
            key,
            View: registeredComponent.View,
            component: registeredComponent,
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

    // Geometry supplies an implicit mesh unless an object component owns the attachments.
    const geometry = composition.find(component => component.component?.slot === 'geometry');
    if (geometry && !composition.some(component => component.order === 1)) {
        composition.push({ key: '$mesh', View: MeshNode, properties: geometry.properties,
            order: 1, renderWhenDisabled: true });
    }

    composition.sort((left, right) => left.order - right.order);

    return {
        clickEvent,
        composition,
        transform,
    };
}

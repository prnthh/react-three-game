import type { Component } from "../../core/ComponentRegistry.js";

export type MeshRenderProperties = {
    visible?: boolean;
    castShadow?: boolean;
    receiveShadow?: boolean;
    frustumCulled?: boolean;
    emitClickEvent?: boolean;
    clickEventName?: string;
};

export type MeshProperties = MeshRenderProperties & { instanced?: boolean };

export const meshRenderProperties: Component<MeshRenderProperties>["properties"] = {
    visible: { type: 'boolean', default: true },
    castShadow: { type: 'boolean', default: true },
    receiveShadow: { type: 'boolean', default: true },
    frustumCulled: { type: 'boolean', default: true, description: 'Cull outside each render camera using geometry bounds. Disable for custom vertex deformation without conservative bounds.' },
    emitClickEvent: { type: 'boolean', default: false },
    clickEventName: { type: 'string', default: '' },
};

export const meshProperties: Component<MeshProperties>["properties"] = {
    ...meshRenderProperties,
    instanced: { type: 'boolean', default: true, description: 'Allow automatic batching with matching geometry, material and shadow flags. Selection and click events can require separate meshes.' },
};

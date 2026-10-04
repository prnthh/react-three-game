import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';

export interface SpriteProps {
    center?: [number, number];
    emitClickEvent?: boolean;
    clickEventName?: string;
}

function SpriteComponentView({ properties, children }: ComponentViewProps<SpriteProps>) {
    return <sprite center={properties.center ?? [0.5, 0.5]}>{children}</sprite>;
}

const SpriteComponent: Component<SpriteProps> = {
    name: 'Sprite',
    description: "Add a camera-facing billboard. Pair with Material {materialType:\"sprite\",texture:\"/textures/image.png\",transparent:true}; Transform.scale sets its size.",
    renderWhenDisabled: true,
    slot: 'object',
    View: SpriteComponentView,
    properties: {
        center: { description: "Anchor in normalized sprite coordinates: [0.5,0.5] centers it; [0.5,0] anchors its bottom.", type: 'vector2', default: [0.5, 0.5] },
        emitClickEvent: { type: 'boolean', default: false },
        clickEventName: { type: 'string', default: 'node:click' },
    },
};

export default SpriteComponent;

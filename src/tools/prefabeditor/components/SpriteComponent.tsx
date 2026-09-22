import type { Component, ComponentViewProps } from './ComponentRegistry';

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
    renderWhenDisabled: true,
    slot: 'object',
    View: SpriteComponentView,
    properties: {
        center: { type: 'vector2', default: [0.5, 0.5] },
        emitClickEvent: { type: 'boolean', default: false },
        clickEventName: { type: 'string', default: 'node:click' },
    },
};

export default SpriteComponent;

import type { Component } from "./ComponentRegistry";

export type TransformProperties = {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
};

const TransformComponent: Component<TransformProperties> = {
    name: 'Transform',
    slot: 'transform',
    properties: {
        position: { type: 'vector3', default: [0, 0, 0] },
        rotation: { type: 'vector3', default: [0, 0, 0] },
        scale: { type: 'vector3', default: [1, 1, 1] },
    }
};

export default TransformComponent;

import type { Component } from "../../core/ComponentRegistry.js";

export type TransformProperties = {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
};

const TransformComponent: Component<TransformProperties> = {
    name: 'Transform',
    description: "Place, rotate or scale this node and its descendants relative to its parent. Y is up; rotations use XYZ Euler radians.",
    slot: 'transform',
    properties: {
        position: { description: "Local xyz position relative to the parent.", type: 'vector3', default: [0, 0, 0] },
        rotation: { description: "Local XYZ Euler angles in radians.", type: 'vector3', default: [0, 0, 0] },
        scale: { description: "Local xyz multipliers; also scales descendants.", type: 'vector3', default: [1, 1, 1] },
    }
};

export default TransformComponent;

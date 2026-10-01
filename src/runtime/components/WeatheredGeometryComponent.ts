import type { BufferGeometry } from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Component } from "../../core/ComponentRegistry";

/** Clone and roughen any geometry; coincident vertices move together to keep seams closed. */
export function roughenGeometry(source: BufferGeometry, amount: number, seed: number, preserveTop = false, preserveBottom = false, displacementScale: readonly number[] = [1, 1, 1]) {
    const geometry = source.clone();
    geometry.computeBoundingBox();
    const top = geometry.boundingBox!.max.y;
    const bottom = geometry.boundingBox!.min.y;
    const positions = geometry.getAttribute('position');
    const noise = (x: number, y: number, z: number, channel: number) => {
        const value = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 19.19 + channel * 53.17) * 43758.5453;
        return (value - Math.floor(value)) * 2 - 1;
    };
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        if ((preserveTop && Math.abs(y - top) < 1e-5) || (preserveBottom && Math.abs(y - bottom) < 1e-5)) continue;
        const qx = Math.round(x * 10000), qy = Math.round(y * 10000), qz = Math.round(z * 10000);
        positions.setXYZ(i, x + noise(qx, qy, qz, 0) * amount / Math.max(Math.abs(displacementScale[0]), 1e-6),
            y + noise(qx, qy, qz, 1) * amount / Math.max(Math.abs(displacementScale[1]), 1e-6), z + noise(qx, qy, qz, 2) * amount / Math.max(Math.abs(displacementScale[2]), 1e-6));
    }
    // Smooth small changes between faces, but retain crisp corners and broken edges.
    const result = toCreasedNormals(geometry, Math.PI / 4);
    if (result !== geometry) geometry.dispose();
    result.computeBoundingBox();
    result.computeBoundingSphere();
    return result;
}

type Properties = { amount: number; seed: number; preserveTop: boolean; preserveBottom: boolean; displacementScale: [number, number, number] };

const WeatheredGeometryComponent: Component<Properties> = {
    name: 'WeatheredGeometry',
    description: 'Roughen this node’s Geometry primitive without changing its material or collision. Add segments on Geometry for finer irregularity. Does not affect child nodes or loaded models.',
    modifyGeometry: (source, p) => roughenGeometry(source, p.amount, p.seed, p.preserveTop, p.preserveBottom, p.displacementScale),
    properties: {
        amount: { default: 0.05, min: 0, max: 0.5, step: 0.01, description: 'Maximum displacement per axis in geometry units.' },
        seed: { default: 1, min: 0, max: 10000, step: 1 },
        displacementScale: { type: 'vector3', default: [1, 1, 1], description: 'Compensate for mesh scale so displacement stays consistent across differently sized pieces.' },
        preserveBottom: { type: 'boolean', default: false, description: 'Keep the base flat and grounded.' },
        preserveTop: { type: 'boolean', default: false, description: 'Keep the top vertices unchanged for flat landing surfaces.' },
    },
};
export default WeatheredGeometryComponent;

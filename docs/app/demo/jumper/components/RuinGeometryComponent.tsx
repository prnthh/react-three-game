import { useEffect, useLayoutEffect, useMemo } from 'react';
import { BoxGeometry, BufferGeometry, CylinderGeometry, PlaneGeometry, SphereGeometry } from 'three';
import { useInvalidateMeshInstances, type Component, type ComponentViewProps } from 'react-three-game/viewer';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Clone and roughen any geometry; coincident vertices move together to keep seams closed. */
export function roughenGeometry(source: BufferGeometry, amount: number, seed: number, preserveTop = false) {
    const geometry = source.clone();
    geometry.computeBoundingBox();
    const top = geometry.boundingBox!.max.y;
    const positions = geometry.getAttribute('position');
    const noise = (x: number, y: number, z: number, channel: number) => {
        const value = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 19.19 + channel * 53.17) * 43758.5453;
        return (value - Math.floor(value)) * 2 - 1;
    };
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        if (preserveTop && Math.abs(y - top) < 1e-5) continue;
        const qx = Math.round(x * 10000), qy = Math.round(y * 10000), qz = Math.round(z * 10000);
        positions.setXYZ(i, x + noise(qx, qy, qz, 0) * amount,
            y + noise(qx, qy, qz, 1) * amount, z + noise(qx, qy, qz, 2) * amount);
    }
    // Smooth small changes between faces, but retain crisp corners and broken edges.
    const result = toCreasedNormals(geometry, Math.PI / 4);
    if (result !== geometry) geometry.dispose();
    result.computeBoundingBox();
    result.computeBoundingSphere();
    return result;
}

type Properties = { geometryType: string; args: number[]; amount: number; seed: number; preserveTop: boolean };
const constructors = { box: BoxGeometry, cylinder: CylinderGeometry, sphere: SphereGeometry, plane: PlaneGeometry };

function RuinGeometryView({ properties, children }: ComponentViewProps<Properties>) {
    const signature = JSON.stringify(properties);
    const geometry = useMemo(() => {
        const Constructor = constructors[properties.geometryType as keyof typeof constructors] ?? BoxGeometry;
        const source = new Constructor(...properties.args);
        const result = roughenGeometry(source, properties.amount, properties.seed, properties.preserveTop);
        source.dispose();
        result.userData.prefabGeometrySignature = `jumper-ruin:${signature}`;
        return result;
    }, [signature]);
    const invalidate = useInvalidateMeshInstances();
    useLayoutEffect(invalidate, [geometry, invalidate]);
    useEffect(() => () => geometry.dispose(), [geometry]);
    return <><primitive object={geometry} attach="geometry" dispose={null} />{children}</>;
}

export const RuinGeometryComponent: Component<Properties> = {
    name: 'JumperRuinGeometry', slot: 'geometry', renderWhenDisabled: true,
    description: 'Roughens primitive vertices with repeatable displacement. Matching settings instance together.',
    properties: {
        geometryType: { type: 'select', default: 'box', options: Object.keys(constructors).map(value => ({ value, label: value })) },
        args: { type: 'number[]', default: [1, 1, 1, 3, 3, 3], description: 'Three.js primitive dimensions and segment counts.' },
        amount: { default: 0.05, min: 0, max: 0.5, step: 0.01, description: 'Maximum displacement per axis in geometry units.' },
        seed: { default: 1, min: 0, max: 10000, step: 1 },
        preserveTop: { type: 'boolean', default: false, description: 'Keep the top vertices unchanged for flat landing surfaces.' },
    },
    View: RuinGeometryView,
};

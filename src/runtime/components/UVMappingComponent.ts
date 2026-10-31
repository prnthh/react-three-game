import { Float32BufferAttribute } from 'three';
import type { Component } from '../../core/ComponentRegistry.js';

/** Hard-surface box projection in local units, including this node's authored scale. */
const UVMappingComponent: Component<{ unitsPerTile: number }> = {
    name: 'UVMapping',
    description: 'Box-project UVs on Geometry primitives. Keeps texture density consistent across box faces. Enable repeat on Material. Uses local dimensions and this node scale; ancestor scale is not included.',
    properties: { unitsPerTile: { default: 2, min: 0.01, step: 0.1, description: 'Local scene units covered by one texture tile.' } },
    modifyGeometry(source, { unitsPerTile = 2 }, context) {
        const geometry = source.clone();
        const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
        if (!positions || !normals) return geometry;
        const scale = context?.scale ?? [1, 1, 1];
        const tile = Number.isFinite(unitsPerTile) ? Math.max(0.01, unitsPerTile) : 2;
        const uv = new Float32Array(positions.count * 2);
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i) * scale[0] / tile;
            const y = positions.getY(i) * scale[1] / tile;
            const z = positions.getZ(i) * scale[2] / tile;
            const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i);
            const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
            const u = ax >= ay && ax >= az ? -z * Math.sign(nx) : ay >= az ? x : x * Math.sign(nz);
            const v = ax >= ay && ax >= az ? y : ay >= az ? -z * Math.sign(ny) : y;
            uv[i * 2] = u; uv[i * 2 + 1] = v;
        }
        geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
        geometry.deleteAttribute('tangent'); // Existing tangents no longer match the UVs.
        return geometry;
    },
};
export default UVMappingComponent;

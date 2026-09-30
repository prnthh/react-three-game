import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BufferGeometry, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, PlaneGeometry,
    RepeatWrapping, SRGBColorSpace, Sphere, Vector3 } from 'three';
import { withBasePath } from '../../../basePath';
import { usePlayerRuntime } from './GrassWorldRuntime';
import { createFlowerMaterial, createGrassMaterial, createVegetationUniforms } from './GrassMaterial';
import { stampGrassTrail, vegetationPlacements, type terrainHeight } from '../terrain';

export type VegetationProps = {
    x: number; z: number; chunkSize: number;
    heightAt: typeof terrainHeight;
    waterLevel: number; shoreClearance: number; transitionWidth: number;
};
type Resources = ReturnType<typeof useVegetationResources>;

function VegetationInstances({ resources, flowers = false, ...props }: VegetationProps & { resources: Resources; flowers?: boolean }) {
    const mesh = useRef<InstancedMesh>(null);
    const player = usePlayerRuntime();
    const { x, z, chunkSize, heightAt, waterLevel, shoreClearance, transitionWidth } = props;
    // Match the original 896² blades over a 130²-unit tile, now anchored to chunks.
    const count = flowers ? Math.round(chunkSize ** 2 * (64 / 150) ** 2) : Math.round(chunkSize ** 2 * (896 / 130) ** 2);
    const placements = useMemo(() => vegetationPlacements(x, z, chunkSize, count, heightAt,
        waterLevel, shoreClearance, transitionWidth),
    [x, z, chunkSize, count, heightAt, waterLevel, shoreClearance, transitionWidth]);
    const template = flowers ? resources.flowerGeometry : resources.grassGeometry;
    const geometry = useMemo(() => {
        const value = template.clone();
        const roots = new Float32Array(placements.length * 3);
        const locals = new Float32Array(placements.length * 3);
        placements.forEach((p, i) => {
            roots.set([x * chunkSize + p.x, p.y, z * chunkSize + p.z], i * 3);
            locals.set([p.x, p.y, p.z], i * 3);
        });
        value.setAttribute('plantRoot', new InstancedBufferAttribute(roots, 3));
        value.setAttribute('plantLocal', new InstancedBufferAttribute(locals, 3));
        value.setAttribute('lastStepped', new InstancedBufferAttribute(new Float32Array(placements.length).fill(-1000), 1));
        return value;
    }, [template, placements, x, z, chunkSize]);
    useLayoutEffect(() => {
        // SpriteNodeMaterial supplies positions; instance matrices stay at identity.
        // Explicit world bounds include the tallest blade and wind deformation.
        if (!mesh.current) return;
        let low = Infinity, high = -Infinity;
        for (const p of placements) { low = Math.min(low, p.y); high = Math.max(high, p.y); }
        const centerY = (low + high) / 2;
        mesh.current.boundingSphere = new Sphere(new Vector3(0, centerY, 0),
            Math.hypot(chunkSize / 2 + 3, chunkSize / 2 + 3, (high - low) / 2 + 4));
    }, [geometry, placements, chunkSize]);
    useFrame(() => {
        if (flowers || !player) return;
        const px = player.position.x - x * chunkSize, pz = player.position.z - z * chunkSize;
        if (Math.abs(px) > chunkSize / 2 + 1 || Math.abs(pz) > chunkSize / 2 + 1) return;
        const trail = geometry.getAttribute('lastStepped') as InstancedBufferAttribute;
        if (stampGrassTrail(placements, trail.array as Float32Array, px, player.position.y, pz, resources.clock.value)) {
            trail.needsUpdate = true;
        }
    });
    if (!placements.length) return null;
    return <instancedMesh ref={mesh} args={[undefined, flowers ? resources.flowerMaterial : resources.grassMaterial, placements.length]}
        >
        <bufferGeometry index={geometry.index} attributes={geometry.attributes} />
    </instancedMesh>;
}

export default function Grass({ resources, ...props }: VegetationProps & { resources: Resources }) {
    return <>
        <VegetationInstances {...props} resources={resources} />
        <VegetationInstances {...props} resources={resources} flowers />
    </>;
}

function createBladeGeometry() {
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let row = 0; row < 4; row++) {
        const h = row / 4, width = 0.03 * (1 - 0.7 * h);
        positions.push(-width, h * 1.75, 0, width, h * 1.75, 0);
        uvs.push(0, h, 1, h);
        if (row > 0) {
            const i = row * 2;
            indices.push(i - 2, i - 1, i + 1, i - 2, i + 1, i);
        }
    }
    positions.push(0, 1.75, 0); uvs.push(0.5, 1); indices.push(6, 7, 8);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

export function useVegetationResources() {
    const player = usePlayerRuntime();
    const [flowers, noise] = useTexture([
        withBasePath('/grassworld/textures/edelweiss.png'),
        withBasePath('/grassworld/textures/noise-atlas.png'),
    ]);
    const resources = useMemo(() => {
        flowers.colorSpace = SRGBColorSpace;
        noise.wrapS = noise.wrapT = RepeatWrapping;
        noise.needsUpdate = true;
        const uniforms = createVegetationUniforms();
        return {
            ...uniforms,
            grassGeometry: createBladeGeometry(), flowerGeometry: new PlaneGeometry(1, 1),
            grassMaterial: createGrassMaterial(noise, uniforms), flowerMaterial: createFlowerMaterial(flowers, uniforms),
        };
    }, [flowers, noise]);
    useFrame((_, delta) => {
        resources.clock.value += Math.min(delta, 0.1);
        if (player) resources.playerPosition.value.copy(player.position);
    }, -0.25);
    useEffect(() => () => {
        resources.grassGeometry.dispose(); resources.flowerGeometry.dispose();
        resources.grassMaterial.dispose(); resources.flowerMaterial.dispose();
    }, [resources]);
    return resources;
}

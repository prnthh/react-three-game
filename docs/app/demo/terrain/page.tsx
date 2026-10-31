'use client';

import { PrefabEditor } from 'react-three-game/editor';
import { registerComponent, type Prefab } from 'react-three-game/viewer';
import { CrashcatRuntime, TerrainPhysicsComponent, CharacterControllerComponent } from 'react-three-game/plugins/crashcat';
import 'react-three-game/plugins/crashcat/editor';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TerrainProfile } from './TerrainProfile';
import { BASE_PATH } from '../../basePath';

registerComponent(TerrainPhysicsComponent);
registerComponent(CharacterControllerComponent);

const GRID_SIZE = 10;
const TILE_SIZE = 32;
const TILE_SPACING = TILE_SIZE;

const prefab: Prefab = {
    id: 'terrain-workshop', name: 'Terrain workshop', root: { id: 'terrain-root', name: 'Terrain workshop', children: [
        ...Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
            const column = index % GRID_SIZE;
            const row = Math.floor(index / GRID_SIZE);
            return { id: `landscape-${row}-${column}`, name: `Landscape ${row + 1} · ${column + 1}`, components: {
            transform: { type: 'Transform', properties: { position: [
                (column - (GRID_SIZE - 1) / 2) * TILE_SPACING, 0,
                (row - (GRID_SIZE - 1) / 2) * TILE_SPACING,
            ] } },
            physics: { type: 'TerrainPhysics', properties: {} },
            terrain: { type: 'Terrain', properties: {
                width: TILE_SIZE, depth: TILE_SIZE, heightScale: 48, segments: 64,
                heightMap: `/textures/terrain-demo/tiles/height-${row}-${column}.png`, weightMap: `/textures/terrain-demo/tiles/weights-${row}-${column}.png`,
                weightResolution: 257,
                layers: [
                    { name: 'Grass', color: '#ffffff', albedoMap: '/textures/floor/terrain/grass-512.jpg', normalMap: '/textures/floor/terrain/grass-normal-gl.png', roughness: 0.95, tileSize: 4 },
                    { name: 'Dirt', color: '#ffffff', albedoMap: '/textures/floor/terrain/dirt-512.jpg', normalMap: '/textures/floor/terrain/dirt-normal-gl.png', roughness: 0.9, tileSize: 4 },
                    { name: 'Rock', color: '#ffffff', albedoMap: '/textures/floor/rocks/gray_rocks_diff_1k.jpg', normalMap: '/textures/floor/rocks/gray_rocks_nor_gl_1k.jpg', displacementMap: '/textures/floor/rocks/gray_rocks_disp_1k.png', displacementScale: 0.35, roughnessMap: '/textures/floor/rocks/gray_rocks_rough_1k.jpg', roughness: 1, tileSize: 4 },
                    { name: 'Sand', color: '#ffffff', albedoMap: '/textures/floor/terrain/sand-512.jpg', normalMap: '/textures/floor/terrain/sand-normal-gl.png', roughness: 0.95, tileSize: 4 },
                ],
            } },
        } };
        }),
        { id: 'terrain-player', name: 'Player', components: {
            transform: { type: 'Transform', properties: { position: [-48, 50, -16] } },
            controller: { type: 'CharacterController', properties: {} },
        } },
        { id: 'terrain-sun', name: 'Sun', components: {
            transform: { type: 'Transform', properties: { position: [120, 180, 80] } },
            light: { type: 'DirectionalLight', properties: { color: '#fff0d6', intensity: 3, castShadow: true, targetOffset: [-120, -180, -80], shadowMapSize: 2048, shadowCameraLeft: -240, shadowCameraRight: 240, shadowCameraTop: 240, shadowCameraBottom: -240, shadowNormalBias: 0.04 } },
        } },
        { id: 'terrain-sky', name: 'Sky fill', components: {
            light: { type: 'HemisphereLight', properties: { color: '#c5ddff', groundColor: '#77705d', intensity: 1.8 } },
        } },
    ] },
};
export default function TerrainPage() {
    const output = useRef<HTMLOutputElement>(null);
    const [options, setOptions] = useState({ profile: false, segments: 64, shadows: true, repeated: false });
    useEffect(() => {
        const query = new URLSearchParams(location.search);
        setOptions({ profile: query.has('profile'), segments: query.get('segments') === '32' ? 32 : 64, shadows: query.get('shadows') !== '0', repeated: query.get('maps') === 'repeated' });
    }, []);
    const profile = options.profile;
    const scene = useMemo(() => {
        const scene = structuredClone(prefab);
        for (const node of scene.root.children ?? []) {
            if (node.components?.terrain) {
                node.components.terrain.properties.segments = options.segments;
                if (options.repeated) Object.assign(node.components.terrain.properties, {
                    heightMap: '/textures/terrain-demo/height.png', weightMap: '/textures/terrain-demo/weights.png', heightScale: 6, weightResolution: 257,
                });
            }
            if (node.components?.light?.type === 'DirectionalLight') node.components.light.properties.castShadow = options.shadows;
        }
        return scene;
    }, [options.segments, options.shadows, options.repeated]);
    return <main style={{ position: 'relative', width: '100%', height: '100dvh', background: '#1b2430' }}>
        <PrefabEditor prefab={scene} basePath={BASE_PATH} canvasProps={{ camera: { position: [340, 320, 390], fov: 50, far: 2000 } }}>
            <CrashcatRuntime />
            {profile && <TerrainProfile output={output} />}
            <color attach="background" args={['#91adbd']} />
        </PrefabEditor>
        {profile && <output ref={output} aria-label="Terrain performance" style={{ position: 'absolute', bottom: 8, right: 8, maxWidth: '70%', overflowWrap: 'anywhere', background: '#111d', color: 'white', fontSize: 11, padding: 8, pointerEvents: 'none' }}>Warming up…</output>}
    </main>;
}

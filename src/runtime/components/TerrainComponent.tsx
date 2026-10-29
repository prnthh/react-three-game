import { useSharedMaterialResource } from './MaterialComponent.js';
import { useSharedGeometryResource } from './GeometryComponent.js';
import { Component as ReactComponent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TextureLoader, type Mesh, type Texture } from 'three';
import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';
import { useTextureAsset } from '../assets/AssetRuntime.js';
import { withBasePath } from '../assets/assetPaths.js';
import { usePrefab, useGameObject, useRegisterNodeComponent } from '../scene/SceneContext.js';
import { notifyObjectChanged } from '../scene/objectChanges.js';
import { createTerrainGeometry, normalizeWeightMap, DEFAULT_TERRAIN_LAYERS, terrainLayers, terrainSettings, type TerrainLayer, type TerrainProperties } from '../terrain/terrainData.js';
import { createWeightSurface, imagePixels, pixels, TERRAIN_SURFACE_COMPONENT, TERRAIN_FAILURE_COMPONENT } from '../terrain/terrainSurface.js';
import { createTerrainMaterial } from '../terrain/terrainMaterial.js';

export type { TerrainProperties, TerrainLayer } from '../terrain/terrainData.js';
function useLayerMaps(layer: TerrainLayer, basePath: string) {
    return {
        albedo: useTextureAsset(layer.albedoMap ? withBasePath(basePath, layer.albedoMap) : null),
        normal: useTextureAsset(layer.normalMap ? withBasePath(basePath, layer.normalMap) : null),
        roughness: useTextureAsset(layer.roughnessMap ? withBasePath(basePath, layer.roughnessMap) : null),
    };
}
// Painted PNGs are unique per stroke. Keep only the current decoded image here,
// rather than retaining every undo revision in the shared asset cache.
function usePaintedWeightMap(path: string) {
    const [loaded, setLoaded] = useState<{ path: string; texture: Texture | null; error?: Error }>({ path: '', texture: null });
    useEffect(() => {
        if (!path) { setLoaded({ path: '', texture: null }); return; }
        let active = true;
        const texture = new TextureLoader().load(path,
            value => { if (active) setLoaded({ path, texture: value }); }, undefined,
            error => { if (active) setLoaded({ path, texture: null, error: error instanceof Error ? error : new Error('Invalid weight PNG') }); });
        return () => { active = false; texture.dispose(); };
    }, [path]);
    if (path && loaded.path === path && loaded.error) throw loaded.error;
    return { texture: path ? loaded.texture : null, ready: !path || loaded.path === path };
}
function TerrainView({ properties, children }: ComponentViewProps<TerrainProperties>) {
    const { basePath } = usePrefab();
    const owner = useGameObject();
    const mesh = useRef<Mesh>(null);
    const settings = terrainSettings(properties);
    const layers = terrainLayers(properties.layers);
    const height = useTextureAsset(properties.heightMap ? withBasePath(basePath, properties.heightMap) : null);
    const embeddedWeights = properties.weightMap?.startsWith('data:') ? properties.weightMap : '';
    const externalWeights = useTextureAsset(properties.weightMap && !embeddedWeights ? withBasePath(basePath, properties.weightMap) : null);
    const paintedWeights = usePaintedWeightMap(embeddedWeights);
    const weights = embeddedWeights ? paintedWeights.texture : externalWeights;
    const maps = [useLayerMaps(layers[0], basePath), useLayerMaps(layers[1], basePath), useLayerMaps(layers[2], basePath), useLayerMaps(layers[3], basePath)];
    const geometryKey = JSON.stringify(['terrain', height?.uuid, height?.version, settings.width, settings.depth, settings.segments, settings.heightScale]);
    const geometry = useSharedGeometryResource(geometryKey, () => createTerrainGeometry(properties, height ? pixels(imagePixels(height)) : null));
    const surface = useMemo(() => createWeightSurface(null, settings.weightResolution), [settings.weightResolution]);
    useLayoutEffect(() => {
        if (!paintedWeights.ready) return;
        const context = surface.canvas.getContext('2d')!;
        if (weights) {
            const image = pixels(imagePixels(weights, settings.weightResolution));
            normalizeWeightMap(image);
            context.putImageData(image, 0, 0);
        } else {
            context.fillStyle = '#ff0000';
            context.fillRect(0, 0, surface.canvas.width, surface.canvas.height);
        }
        surface.texture.needsUpdate = true;
    }, [weights, surface, settings.weightResolution, paintedWeights.ready]);
    const materialKey = JSON.stringify([layers, maps.map(layer => Object.values(layer).map(map => map?.uuid))]);
    const material = useSharedMaterialResource(`terrain:${surface.texture.uuid}:${settings.width}:${settings.depth}:${materialKey}`,
        () => createTerrainMaterial(layers, maps, surface, settings.width, settings.depth));
    const liveSurface = useMemo(() => ({ ...surface,
        // React attaches the mesh ref before the component registry's layout effect.
        get mesh() { return mesh.current!; },
        width: settings.width, depth: settings.depth, ready: paintedWeights.ready,
    }), [surface, settings.width, settings.depth, paintedWeights.ready]);
    useRegisterNodeComponent(TERRAIN_SURFACE_COMPONENT, liveSurface);
    useLayoutEffect(() => {
        if (owner.transform) notifyObjectChanged(owner.transform, 'geometry');
    }, [geometry, owner]);
    useEffect(() => () => surface.texture.dispose(), [surface]);
    return <mesh ref={mesh} geometry={geometry} material={material} castShadow receiveShadow dispose={null}>{children}</mesh>;
}
class TerrainBoundary extends ReactComponent<{ resetKey: string; failure: (message: string | null) => void; children: ReactNode }, { error: Error | null }> {
    state: { error: Error | null } = { error: null };
    static getDerivedStateFromError(error: Error) { return { error }; }
    componentDidCatch(error: Error) { this.props.failure(`Terrain image could not be loaded or read: ${error.message}`); }
    componentDidUpdate(previous: Readonly<{ resetKey: string }>) {
        if (this.state.error && previous.resetKey !== this.props.resetKey) {
            this.props.failure(null);
            this.setState({ error: null });
        }
    }
    render() { return this.state.error ? null : this.props.children; }
}
function TerrainComponentView(props: ComponentViewProps<TerrainProperties>) {
    const [failure, setFailure] = useState<string | null>(null);
    useRegisterNodeComponent(TERRAIN_FAILURE_COMPONENT, failure);
    return <TerrainBoundary resetKey={JSON.stringify(props.properties)} failure={setFailure}>
        <TerrainView {...props} />
    </TerrainBoundary>;
}
const TerrainComponent: Component<TerrainProperties> = {
    name: 'Terrain', slot: 'object', category: 'mesh', renderWhenDisabled: true,
    description: 'Height-map terrain with four PBR layers blended by paintable material weights. Owns its geometry and material; no separate Geometry or Material is needed.',
    View: TerrainComponentView,
    dependencies: properties => [properties.heightMap, properties.weightMap?.startsWith('data:') ? null : properties.weightMap,
        ...terrainLayers(properties.layers).flatMap(layer => [layer.albedoMap, layer.normalMap, layer.roughnessMap])]
        .filter((path): path is string => !!path).map(path => ({ kind: 'texture', path })),
    properties: {
        width: { default: 32, min: 0.1, max: 10000, step: 1 },
        depth: { default: 32, min: 0.1, max: 10000, step: 1 },
        segments: { default: 128, min: 1, max: 512, step: 1, description: 'Subdivisions per axis. Height deformation updates real mesh geometry and raycasts.' },
        heightScale: { default: 8, min: 0, max: 10000, step: 0.1 },
        heightMap: { type: 'string', default: '', description: 'Linear grayscale height image; red 0..255 maps to 0..heightScale. Empty means flat.' },
        weightMap: { type: 'string', default: '', description: 'Linear RGB weights for layers 1–3; layer 4 is the remainder. Opaque PNG. Empty means all layer 1. Editor strokes embed lossless PNG data URLs.' },
        weightResolution: { default: 256, min: 16, max: 1024, step: 1, description: 'Editable weight map resolution per axis. Source weights are resampled to this size.' },
        layers: { type: 'array', default: DEFAULT_TERRAIN_LAYERS, description: 'Four layers in fixed channel order, each with name, color tint, albedoMap, normalMap, roughnessMap, roughness and tileSize in local scene units.',
            schema: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'object', properties: {
                name: { type: 'string' }, color: { type: 'string' }, albedoMap: { type: 'string' }, normalMap: { type: 'string' }, roughnessMap: { type: 'string' },
                roughness: { type: 'number', minimum: 0, maximum: 1 }, tileSize: { type: 'number', exclusiveMinimum: 0 },
            }, additionalProperties: false } } },
    },
};
export default TerrainComponent;

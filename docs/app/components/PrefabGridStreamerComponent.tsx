import { useFrame } from '@react-three/fiber';
import { useContext, useLayoutEffect, useMemo, useState } from 'react';
import { CityProfiling, reportCityTiming } from './cityProfiling';
import { Matrix4, Vector3 } from 'three';
import { createStore, useStore } from 'zustand';
import { framePriority, PrefabEditorMode, PrefabInstance, useGameObject, usePrefab, useScene, usePrefabStore, type Component, type ComponentViewProps } from 'react-three-game/viewer';
import { findComponent, resolveInlinePrefab } from 'react-three-game/core';


type Coordinate = [number, number, number];
type Tile = { key: string; coordinate: Coordinate };
const tileKey = (coordinate: Coordinate) => coordinate.join(',');
const tileAt = (coordinate: Coordinate): Tile => ({ key: tileKey(coordinate), coordinate });

// Signed axis of the first tile face intersected by the ray, or zero for no exit.
function nextFace(position: Vector3, ray: Vector3, cell: Coordinate, size: Coordinate, center: Coordinate) {
    let nearest = Infinity, face = 0;
    for (let axis = 0; axis < 3; axis++) {
        const speed = ray.getComponent(axis);
        if (!speed || size[axis] <= 0) continue;
        const sign = Math.sign(speed);
        const boundary = center[axis] + (cell[axis] + sign * 0.5) * size[axis];
        const time = (boundary - position.getComponent(axis)) / speed;
        if (time < nearest) { nearest = time; face = sign * (axis + 1); }
    }
    return face;
}

/** Placement policy only; PrefabInstance owns resource loading and activation. */
function createPrefabGrid(editor = false) {
    let limit = 0;
    let current = tileAt([0, 0, 0]);
    const lastPosition = new Vector3(), motion = new Vector3();
    let sampled = false, travelFace = 0, viewFace = 0;
    const placements = createStore<Tile[]>(() => editor ? [current] : []);
    const active = new Set<string>();
    let dirty = true;
    const sample: Coordinate = [0, 0, 0];

    const adjacent = (tile: Tile) => sample.every((value, axis) => Math.abs(value - tile.coordinate[axis]) <= 1);

    return {
        placements,
        activate(key: string) {
            // Ignore late notifications from placements that have already been evicted.
            if (active.has(key) || !placements.getState().some(tile => tile.key === key)) return;
            active.add(key);
            dirty = true;
        },
        update(position: Vector3, forward: Vector3, size: Coordinate, center: Coordinate, maxTiles: number) {
            const capacity = Number.isFinite(maxTiles) ? Math.max(2, Math.min(3, Math.floor(maxTiles))) : 3;
            if (limit !== capacity) { limit = capacity; dirty = true; }

            for (let axis = 0; axis < 3; axis++) {
                sample[axis] = size[axis] > 0 ? Math.floor((position.getComponent(axis) - center[axis]) / size[axis] + 0.5) : 0;
            }
            if (sampled) motion.subVectors(position, lastPosition);
            lastPosition.copy(position);
            const coordinate = current.coordinate;
            if (sample[0] !== coordinate[0] || sample[1] !== coordinate[1] || sample[2] !== coordinate[2]) {
                if (!adjacent(current)) motion.set(0, 0, 0);
                for (const tile of placements.getState()) if (!adjacent(tile)) active.delete(tile.key);
                current = tileAt([...sample]);
                dirty = true;
            }
            sampled = true;
            const view = nextFace(position, forward, sample, size, center);
            const travel = nextFace(position, motion, sample, size, center);
            if (!dirty && view === viewFace && travel === travelFace) return;
            viewFace = view;
            travelFace = travel;
            dirty = false;
            const tiles = placements.getState();
            const next = new Map<string, Tile>([[current.key, current]]);
            const add = (tile?: Tile) => {
                if (tile && next.size < limit) next.set(tile.key, tile);
            };
            // Reserve one slot for visible terrain until the camera's chunk activates.
            if (!active.has(current.key)) {
                add(tiles.find(tile => active.has(tile.key)));
            }
            if (active.size) {
                for (const face of [travelFace, viewFace]) {
                    if (!face || next.size >= limit) continue;
                    const neighbor: Coordinate = [...current.coordinate];
                    neighbor[Math.abs(face) - 1] += Math.sign(face);
                    add(tileAt(neighbor));
                }
                // Keep already mounted neighbors when demand leaves a spare slot.
                for (const tile of tiles) if (adjacent(tile)) add(tile);
            }
            const values = [...next.values()];
            if (values.length === tiles.length && values.every((tile, index) => tile.key === tiles[index].key)) return;
            for (const tile of tiles) if (!next.has(tile.key)) active.delete(tile.key);
            placements.setState(values, true);
        },
    };
}

type Properties = { url?: string; prefabId?: string; tileSize?: Coordinate; tileCenter?: Coordinate; maxTiles?: number; static?: boolean;
 };
function PrefabGridStreamerView({ properties, children }: ComponentViewProps<Properties>) {
    const profiling = useContext(CityProfiling);
    const { mode, editable } = useScene();
    const host = useGameObject();
    const { nodeId } = host;
    const { basePath } = usePrefab();
    const [sample] = useState(() => ({ position: new Vector3(), forward: new Vector3(), inverse: new Matrix4() }));
    const { url, tileSize, tileCenter } = properties;
    const document = usePrefabStore(state => properties.prefabId && Object.hasOwn(state.prefabs ?? {}, properties.prefabId)
        ? resolveInlinePrefab(state, properties.prefabId) : undefined);
    const editing = mode === PrefabEditorMode.Edit;
    const editingPrototype = editing && !!document;
    // Only reuse the authored tree when it represents exactly the origin tile.
    const ownsOrigin = usePrefabStore(state => {
        const ids = state.childIdsById[nodeId];
        if (!editable || ids?.length !== 1 || ids[0] !== properties.prefabId) return false;
        const owner = state.nodesById[ids[0]];
        if (!owner?.packed || owner.hidden || owner.disabled) return false;
        // Packing strips the owner's placement transform from streamed copies.
        const transform = findComponent(owner, 'Transform')?.properties;
        return !(transform?.position?.some((v: number) => v !== 0) || transform?.rotation?.some((v: number) => v !== 0) ||
            transform?.scale?.some((v: number) => v !== 1));
    });
    const reuseOrigin = !!document && ownsOrigin;
    // Only source or placement changes replace prepared tiles.
    const placementKey = JSON.stringify([basePath, properties.prefabId || url, tileSize, properties.static]);
    const grid = useMemo(() => createPrefabGrid(editable), [placementKey, editable]);
    const tiles = useStore(grid.placements);
    const residentOrigin = reuseOrigin && tiles.some(tile => tile.key === '0,0,0');
    useLayoutEffect(() => {
        if (residentOrigin) grid.activate('0,0,0');
    }, [grid, residentOrigin]);
    useFrame(({ camera }) => {
        if (editing || !host.transform || (!document && !url)) return;
        host.transform.updateWorldMatrix(true, false);
        sample.inverse.copy(host.transform.matrixWorld).invert();
        camera.getWorldDirection(sample.forward).transformDirection(sample.inverse);
        sample.position.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(sample.inverse);
        grid.update(sample.position, sample.forward, tileSize, tileCenter, properties.maxTiles);
    }, framePriority.streamingPlacements);

    return <>
        {(!document || editing || residentOrigin) && children}
        {(document || url) && tiles.map(tile =>
            (reuseOrigin || editingPrototype) && tile.key === '0,0,0' ? null :
            <group key={`${placementKey}:${tile.key}`} position={tile.coordinate.map((value, axis) => value * tileSize[axis]) as Coordinate}>
                <PrefabInstance id={`${nodeId}/${tile.key}`} url={url} document={document} static={properties.static === true}
                    onStatus={status => { if (status.phase === 'error') console.error('Prefab streaming failed:', status.error); }}
                    onChunkTiming={profiling ? timing => reportCityTiming(tile.key, timing) : undefined}
                    onActivate={() => grid.activate(tile.key)} />
            </group>)}
    </>;
}

const PrefabGridStreamerComponent: Component<Properties> = {
    name: 'PrefabGridStreamer',
    View: PrefabGridStreamerView,
    category: 'misc',
    description: 'Repeat a prefab around the active camera in Play. Uses a packed child definition or URL; ChunkSettings on the scene root controls spatial partitioning. Packed prototypes remain editable in Edit.',
    dependencies: properties => !properties.prefabId && properties.url ? [{ kind: 'prefab', path: properties.url }] : [],
    properties: {
        url: { type: 'string', default: '' },
        prefabId: { type: 'string', default: '', description: 'Packed child definition in this document. Editable in Edit; streamed placements in Play.' },
        static: { type: 'boolean', default: false },
        tileSize: { type: 'vector3', default: [160, 0, 320] },
        tileCenter: { type: 'vector3', default: [0, 0, 0] },
        maxTiles: { default: 3, min: 2, max: 3, step: 1 },
    },
};
export default PrefabGridStreamerComponent;

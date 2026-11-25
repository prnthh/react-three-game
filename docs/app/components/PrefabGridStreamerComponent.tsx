import { useFrame, useThree } from '@react-three/fiber';
import { useContext, useLayoutEffect, useMemo, useRef } from 'react';
import { CityProfiling, reportCityTiming } from './cityProfiling';
import { Vector3 } from 'three';
import { createStore, useStore } from 'zustand';
import { PrefabEditorMode, PrefabInstance, useGameObject, usePrefab, useScene, usePrefabStore, type Component, type ComponentViewProps } from 'react-three-game/viewer';
import { findComponent, resolveInlinePrefab } from 'react-three-game/core';


type Coordinate = [number, number, number];
type Tile = { key: string; coordinate: Coordinate };
const tileKey = (coordinate: Coordinate) => coordinate.join(',');
const tileAt = (coordinate: Coordinate): Tile => ({ key: tileKey(coordinate), coordinate });

function gridCell(position: Coordinate, size: Coordinate, center: Coordinate): Coordinate {
    return size.map((length, axis) => length > 0
        ? Math.floor((position[axis] - center[axis] + length / 2) / length) : 0) as Coordinate;
}

/** Placement policy only; PrefabInstance owns resource loading and activation. */
function createPrefabGrid() {
    let limit = 0;
    let current = tileAt([0, 0, 0]);
    let previous: Tile | undefined;
    let direction: Coordinate | undefined;
    const placements = createStore<Tile[]>(() => [current]);
    const active = new Set<string>();
    let dirty = true;

    return {
        placements,
        activate(key: string) {
            // Ignore late notifications from placements that have already been evicted.
            if (active.has(key) || !placements.getState().some(tile => tile.key === key)) return;
            active.add(key);
            dirty = true;
        },
        update(coordinate: Coordinate, size: Coordinate, maxTiles: number) {
            const capacity = Number.isFinite(maxTiles) ? Math.max(2, Math.min(3, Math.floor(maxTiles))) : 3;
            if (limit !== capacity) { limit = capacity; dirty = true; }

            const key = tileKey(coordinate);
            if (key !== current.key) {
                direction = coordinate.map((value, axis) => size[axis] > 0
                    ? Math.sign(value - current.coordinate[axis]) : 0) as Coordinate;
                previous = current;
                current = tileAt(coordinate);
                dirty = true;
            }
            if (!dirty) return;
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
                const ahead = direction ?? [0, 0, size[2] > 0 ? -1 : 0];
                add(tileAt(coordinate.map((value, axis) => value + ahead[axis]) as Coordinate));
                add(previous);
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
    const camera = useThree(state => state.camera);
    const position = useRef(new Vector3());
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
    const grid = useMemo(createPrefabGrid, [placementKey]);
    const tiles = useStore(grid.placements);
    const residentOrigin = reuseOrigin && tiles.some(tile => tile.key === '0,0,0');
    useLayoutEffect(() => {
        if (residentOrigin) grid.activate('0,0,0');
    }, [grid, residentOrigin]);
    useFrame(() => {
        if (editing || !host.transform || (!document && !url)) return;
        camera.getWorldPosition(position.current);
        host.transform.worldToLocal(position.current);
        grid.update(gridCell(position.current.toArray(), tileSize, tileCenter), tileSize, properties.maxTiles);
    });

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
    description: 'Repeat a prefab around the active camera in Play. Uses a packed child definition or URL; ChunkSettings on the scene root controls distance streaming. Packed prototypes remain editable in Edit.',
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

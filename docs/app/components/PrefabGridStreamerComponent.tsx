import { useFrame, useThree } from '@react-three/fiber';
import { createContext, useContext, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { PrefabEditorMode, PrefabInstance, useNode, useGameObject, usePrefab, useScene, type Component, type ComponentViewProps, type PrefabInstanceStatus } from 'react-three-game/viewer';

type Coordinate = [number, number, number];
type Tile = { key: string; coordinate: Coordinate };
const tileKey = (coordinate: Coordinate) => coordinate.join(',');
const tileAt = (coordinate: Coordinate): Tile => ({ key: tileKey(coordinate), coordinate });

function gridCell(position: Coordinate, size: Coordinate, center: Coordinate): Coordinate {
    return size.map((length, axis) => length > 0
        ? Math.floor((position[axis] - center[axis] + length / 2) / length) : 0) as Coordinate;
}

/** Placement policy only; PrefabInstance owns resource loading and activation. */
function createPrefabGrid(size: Coordinate, maxTiles: number) {
    const limit = Number.isFinite(maxTiles) ? Math.max(2, Math.min(3, Math.floor(maxTiles))) : 3;
    let current = tileAt([0, 0, 0]);
    let previous: Tile | undefined;
    let direction: Coordinate = [0, 0, size[2] > 0 ? -1 : 0];
    let tiles = [current];
    const active = new Set<string>();
    let dirty = true;

    return {
        get tiles() { return tiles; },
        activate(key: string) {
            // Ignore late notifications from placements that have already been evicted.
            if (!tiles.some(tile => tile.key === key) || active.has(key)) return;
            active.add(key);
            dirty = true;
        },
        update(coordinate: Coordinate) {
            const key = tileKey(coordinate);
            if (key !== current.key) {
                direction = coordinate.map((value, axis) => size[axis] > 0
                    ? Math.sign(value - current.coordinate[axis]) : 0) as Coordinate;
                previous = current;
                current = tileAt(coordinate);
                dirty = true;
            }
            if (!dirty) return tiles;
            dirty = false;
            const next = new Map<string, Tile>([[current.key, current]]);
            const add = (tile?: Tile) => {
                if (tile && next.size < limit) next.set(tile.key, tile);
            };
            // Reserve one slot for visible terrain until the camera's chunk activates.
            if (!active.has(current.key)) {
                add(tiles.find(tile => active.has(tile.key)));
            }
            if (active.size) {
                add(tileAt(coordinate.map((value, axis) => value + direction[axis]) as Coordinate));
                add(previous);
            }
            const values = [...next.values()];
            if (values.length === tiles.length && values.every((tile, index) => tile.key === tiles[index].key)) return tiles;
            for (const tile of tiles) if (!next.has(tile.key)) active.delete(tile.key);
            tiles = values;
            return tiles;
        },
    };
}

type Properties = { url?: string; tileSize?: Coordinate; tileCenter?: Coordinate; maxTiles?: number; static?: boolean };
/** Demo UI observes real instance phases instead of guessing from download counters. */
export const DemoChunkStatusContext = createContext<((status: PrefabInstanceStatus) => void) | null>(null);

function PrefabGridStreamerView({ properties, children }: ComponentViewProps<Properties>) {
    const { basePath } = usePrefab();
    const { mode } = useScene();
    const host = useGameObject();
    const { nodeId } = useNode();
    const camera = useThree(state => state.camera);
    const report = useContext(DemoChunkStatusContext);
    const [grid] = useState(() => createPrefabGrid(properties.tileSize, properties.maxTiles));
    const [tiles, setTiles] = useState(grid.tiles);
    const position = useRef(new Vector3());
    const { url, tileSize, tileCenter } = properties;

    useFrame(() => {
        if (mode !== PrefabEditorMode.Play || !host.transform || !url) return;
        camera.getWorldPosition(position.current);
        host.transform.worldToLocal(position.current);
        const next = grid.update(gridCell(position.current.toArray(), tileSize, tileCenter));
        if (next !== tiles) setTiles(next);
    });

    return <>
        {url && tiles.map(tile => <group key={`${url}:${tile.key}`} position={tile.coordinate.map((value, axis) => value * tileSize[axis]) as Coordinate}>
            <PrefabInstance id={`${nodeId}/${tile.key}`} url={url} basePath={basePath} static={properties.static === true && mode === PrefabEditorMode.Play} onStatus={status => {
                if (status.phase === 'active') grid.activate(tile.key);
                report?.(status);
            }} />
        </group>)}
        {children}
    </>;
}

function PrefabGridStreamer(props: ComponentViewProps<Properties>) {
    const { mode } = useScene();
    const { basePath } = usePrefab();
    const { url, tileSize, tileCenter, maxTiles, static: isStatic } = props.properties;
    const key = JSON.stringify([mode, basePath, url, tileSize, tileCenter, maxTiles, isStatic]);
    return <PrefabGridStreamerView key={key} {...props} />;
}

const PrefabGridStreamerComponent: Component<Properties> = {
    name: 'PrefabGridStreamer',
    View: PrefabGridStreamer,
    dependencies: properties => properties.url ? [{ kind: 'prefab', path: properties.url }] : [],
    properties: {
        url: { type: 'string', default: '' },
        static: { type: 'boolean', default: false },
        tileSize: { type: 'vector3', default: [160, 0, 320] },
        tileCenter: { type: 'vector3', default: [0, 0, 0] },
        maxTiles: { default: 3, min: 2, max: 3, step: 1 },
    },
};
export default PrefabGridStreamerComponent;

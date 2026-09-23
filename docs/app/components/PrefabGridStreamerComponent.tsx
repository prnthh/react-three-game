import { useFrame, useThree } from '@react-three/fiber';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { PrefabEditorMode, PrefabInstance, useNode, useGameObject, usePrefab, useScene, type Component, type ComponentViewProps, type PrefabInstanceStatus } from 'react-three-game/viewer';

type Coordinate = [number, number, number];
type Properties = { url?: string; tileSize?: Coordinate; tileCenter?: Coordinate; maxTiles?: number; static?: boolean };
type Tile = { key: string; coordinate: Coordinate };
const keyOf = (coordinate: Coordinate) => coordinate.join(',');
const origin: Tile = { key: '0,0,0', coordinate: [0, 0, 0] };

/** Demo UI observes real instance phases instead of guessing from download counters. */
export const DemoChunkStatusContext = createContext<((status: PrefabInstanceStatus) => void) | null>(null);

function PrefabGridStreamerView({ properties, children }: ComponentViewProps<Properties>) {
    const { basePath } = usePrefab();
    const { mode } = useScene();
    const host = useGameObject();
    const { nodeId } = useNode();
    const camera = useThree(state => state.camera);
    const report = useContext(DemoChunkStatusContext);
    const [tiles, setTiles] = useState<Tile[]>([origin]);
    const mounted = useRef(tiles);
    mounted.current = tiles;
    const ready = useRef(new Set<string>());
    const lastCell = useRef<Coordinate>([0, 0, 0]);
    const previousCell = useRef<Coordinate | null>(null);
    const travelStep = useRef<Coordinate>([0, 0, -1]);
    const position = useRef(new Vector3());
    const url = properties.url ?? '';
    const tileSize = properties.tileSize ?? [160, 0, 320];
    const center = properties.tileCenter ?? [0, 0, 0];
    useEffect(() => {
        ready.current.clear();
        setTiles([origin]);
        lastCell.current = [0, 0, 0];
        previousCell.current = null;
    }, [url, mode]);

    useFrame(() => {
        if (mode !== PrefabEditorMode.Play || !host.transform || !url) return;
        camera.getWorldPosition(position.current);
        host.transform.worldToLocal(position.current);
        const current = tileSize.map((size, axis) => size > 0
            ? Math.floor((position.current.getComponent(axis) - center[axis] + size / 2) / size) : 0) as Coordinate;
        const currentKey = keyOf(current);
        if (keyOf(lastCell.current) !== currentKey) {
            previousCell.current = lastCell.current;
            travelStep.current = current.map((value, axis) => Math.sign(value - lastCell.current[axis])) as Coordinate;
            lastCell.current = current;
        }
        const desired = [current];
        // Prioritize the first visible chunk before spending work on the next edge.
        if (ready.current.size > 0) {
            desired.push(current.map((value, axis) => value + travelStep.current[axis]) as Coordinate);
            if ((properties.maxTiles ?? 3) >= 3 && previousCell.current) desired.push(previousCell.current);
        }
        const next = new Map(desired.map(coordinate => [keyOf(coordinate), { key: keyOf(coordinate), coordinate }]));
        // Keep the last active terrain until the replacement has actually compiled.
        if (!ready.current.has(currentKey)) {
            for (const tile of mounted.current) if (ready.current.has(tile.key)) next.set(tile.key, tile);
        }
        const values = [...next.values()];
        if (values.length === mounted.current.length && values.every((tile, i) => tile.key === mounted.current[i].key)) return;
        for (const tile of mounted.current) if (!next.has(tile.key)) ready.current.delete(tile.key);
        setTiles(values);
    });

    return <>
        {url && tiles.map(tile => <group key={`${url}:${tile.key}`} position={tile.coordinate.map((value, axis) => value * tileSize[axis]) as Coordinate}>
            <PrefabInstance id={`${nodeId}/${tile.key}`} url={url} basePath={basePath} static={properties.static === true && mode === PrefabEditorMode.Play} onStatus={status => {
                if (status.phase === 'active') ready.current.add(tile.key);
                report?.(status);
            }} />
        </group>)}
        {children}
    </>;
}

const PrefabGridStreamerComponent: Component<Properties> = {
    name: 'PrefabGridStreamer',
    View: PrefabGridStreamerView,
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

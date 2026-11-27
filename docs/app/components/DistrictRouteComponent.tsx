import { useFrame } from '@react-three/fiber';
import { useContext, useMemo, useRef, useState } from 'react';
import { CityProfiling, reportCityTiming } from './cityProfiling';
import { MathUtils, Vector3 } from 'three';
import { framePriority, PrefabEditorMode, PrefabInstance, useGameObject, useScene, usePrefabStore, type Component, type ComponentViewProps, type PrefabInstanceProps } from 'react-three-game/viewer';
import { findComponent, resolveInlinePrefab } from 'react-three-game/core';


type Properties = { prefabId: string; nextTileUrls: string[]; tileLength: number; centerZ: number };
function DistrictRouteView(props: ComponentViewProps<Properties>) {
    const { editable } = useScene();
    return <TileWindow key={String(editable)} {...props} />;
}

function TileWindow({ properties, children }: ComponentViewProps<Properties>) {
    const { mode, editable } = useScene();
    const host = useGameObject();
    const { nodeId } = host;
    const [position] = useState(() => new Vector3());
    const [current, setCurrent] = useState<number | null>(null);
    const { prefabId, nextTileUrls, tileLength, centerZ } = properties;
    const document = usePrefabStore(state => prefabId && Object.hasOwn(state.prefabs ?? {}, prefabId)
        ? resolveInlinePrefab(state, prefabId) : undefined);
    const sources = useMemo(() => document ? [document, ...nextTileUrls.map(path => path.trim()).filter(Boolean)] : [], [document, nextTileUrls]);
    const editing = mode === PrefabEditorMode.Edit;
    const editingPrototype = editing && !!document;
    // Only reuse the authored tree when it represents exactly the origin tile.
    const ownsOrigin = usePrefabStore(state => {
        const ids = state.childIdsById[nodeId];
        if (!editable || ids?.length !== 1 || ids[0] !== prefabId) return false;
        const owner = state.nodesById[ids[0]];
        if (!owner?.packed || owner.hidden || owner.disabled) return false;
        // Packing strips the owner's placement transform from streamed copies.
        const transform = findComponent(owner, 'Transform')?.properties;
        return !(transform?.position?.some((v: number) => v !== 0) || transform?.rotation?.some((v: number) => v !== 0) ||
            transform?.scale?.some((v: number) => v !== 1));
    });
    const reuseOrigin = !!document && ownsOrigin;
    const tiles = current === null ? (editable ? [0] : []) : [current, current - 1, current + 1];
    const residentOrigin = reuseOrigin && tiles.includes(0);
    useFrame(({ camera }) => {
        if (editing || !host.transform || !document || !(tileLength > 0)) return;
        camera.getWorldPosition(position);
        host.transform.worldToLocal(position);
        const tile = Math.floor((position.z - centerZ) / tileLength + 0.5);
        if (tile !== current) setCurrent(tile);
    }, framePriority.streamingPlacements);

    return <>
        {(!document || editing || residentOrigin) && children}
        {document && tiles.map(tile => {
            if ((reuseOrigin || editingPrototype) && tile === 0) return null;
            const source = sources[MathUtils.euclideanModulo(-tile, sources.length)];
            return <group key={tile} position-z={tile * tileLength}>
                <TilePrefab tile={tile} id={`${nodeId}/${tile}`} source={source} />
            </group>;
        })}
    </>;
}

function TilePrefab({ tile, ...props }: Pick<PrefabInstanceProps, 'id' | 'source'> & { tile: number }) {
    const profiling = useContext(CityProfiling);
    const started = useRef<number | null>(null);
    return <PrefabInstance {...props} static onStatus={status => {
        if (status.phase === 'error') console.error('Prefab streaming failed:', status.error);
        if (!profiling) return;
        if (status.phase === 'loading') started.current = performance.now();
        if (status.phase === 'active' && started.current !== null) {
            performance.measure('City tile: loading → active', { start: started.current, detail: { tile } });
            started.current = null;
        }
    }} onChunkTiming={profiling ? timing => reportCityTiming(tile, timing) : undefined} />;
}

const DistrictRouteComponent: Component<Properties> = {
    name: 'DistrictRoute',
    View: DistrictRouteView,
    category: 'misc',
    description: 'Stream the boulevard district under the camera and its two neighbors along local Z.',
    properties: {
        prefabId: { type: 'string', default: '', description: 'Packed child definition in this document. Editable in Edit; streamed placements in Play.' },
        nextTileUrls: { type: 'array', default: [], schema: { type: 'array', items: { type: 'string' } },
            description: 'Additional prefab URLs in travel order along negative Z. The sequence wraps in either direction.' },
        tileLength: { default: 320, min: 1 },
        centerZ: { default: 0 },
    },
};
export default DistrictRouteComponent;

import { DEFAULT_SPATIAL_CELL_SIZE } from '../spatial/spatialCell.js';
import { ChunkSettingsContext } from '../components/ChunkSettingsComponent.js';
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { Group, type Mesh } from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { MeshInstanceRegistry } from './MeshInstanceRuntime.js';

/** Forward batched clicks to the host that owns each source mesh. */
export const InstanceClickContext = createContext<((event: ThreeEvent<MouseEvent>) => void) | undefined>(undefined);

const MeshInstanceContext = createContext<MeshInstanceRegistry | null>(null);

function MeshInstanceBatches({ registry }: { registry: MeshInstanceRegistry }) {
    const root = useMemo(() => new Group(), []);
    useLayoutEffect(() => registry.connect(root), [registry, root]);
    useFrame(() => registry.update());
    return <primitive object={root} onClick={registry.handleClick} dispose={null} />;
}

/** null disables secondary partitioning for an isolated, already bounded stream chunk. */
export function MeshInstanceProvider({ children, isolated = false, static: isStatic = false, spatialCellSize }: { children: ReactNode; isolated?: boolean; static?: boolean; spatialCellSize?: number | null }) {
    const settings = useContext(ChunkSettingsContext);
    const inheritedCellSize = settings?.batchCellSize ?? DEFAULT_SPATIAL_CELL_SIZE;
    const cellSize = spatialCellSize === undefined ? inheritedCellSize : spatialCellSize;
    const parent = useContext(MeshInstanceContext);
    const inherited = isolated ? null : parent;
    const registry = useMemo(() => inherited ?? new MeshInstanceRegistry(isStatic, cellSize), [inherited, isStatic, cellSize]);
    if (inherited) return children;
    return (
        <MeshInstanceContext.Provider value={registry}>
            {children}
            <MeshInstanceBatches registry={registry} />
        </MeshInstanceContext.Provider>
    );
}

export function useMeshInstanceRegistration(id: string, meshRef: RefObject<Mesh | null>, eligible: boolean) {
    const registry = useContext(MeshInstanceContext);
    const onClick = useContext(InstanceClickContext);
    const clickHandler = useRef(onClick);
    useLayoutEffect(() => { clickHandler.current = onClick; }, [onClick]);
    useLayoutEffect(() => {
        const mesh = meshRef.current;
        if (!registry || !mesh || !eligible || !mesh.geometry || !mesh.material || mesh.children.length > 0) return;
        return registry.register({
            id,
            mesh,
            onClick: event => clickHandler.current?.(event),
        });
    }, [eligible, id, meshRef, registry]);
}

const NOOP = () => {};

/** Rebuilds instance batches after a custom material changes its instancing contract. */
export function useInvalidateMeshInstances() {
    return useContext(MeshInstanceContext)?.invalidate ?? NOOP;
}

const noSubscribe = () => NOOP;
const zero = () => 0;
/** Observe batch revisions only while a streamed chunk is preparing. */
export function useMeshInstanceRevision(enabled = true) {
    const registry = useContext(MeshInstanceContext);
    if (!registry) throw new Error("Mesh instance registry is unavailable");
    return useSyncExternalStore(enabled ? registry.subscribe : noSubscribe, enabled ? registry.getSnapshot : zero, zero);
}

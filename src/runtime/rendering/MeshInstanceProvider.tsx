import { DEFAULT_SPATIAL_CELL_SIZE } from '../spatial/SpatialGrid.js';
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { Group, type Mesh } from 'three';
import { useFrame } from '@react-three/fiber';
import { EditPickContext } from '../scene/SelectionRuntime.js';
import { MeshInstanceRegistry } from './MeshInstanceRuntime.js';
export { hideInstancedSources, manageInstancedSourceVisibility, supportsInstanceMatrix } from './MeshInstanceRuntime.js';

const MeshInstanceContext = createContext<MeshInstanceRegistry | null>(null);
const MeshInstancingEnabled = createContext(true);

function MeshInstanceBatches({ registry }: { registry: MeshInstanceRegistry }) {
    const root = useMemo(() => new Group(), []);
    useLayoutEffect(() => registry.connect(root), [registry, root]);
    useFrame(() => registry.update());
    return <primitive object={root} onClick={registry.handleClick} dispose={null} />;
}

/** Owns one mesh bucket registry for the complete nested prefab tree. */
export const SpatialCellSizeContext = createContext(DEFAULT_SPATIAL_CELL_SIZE);

export function MeshInstanceProvider({ children, isolated = false, static: isStatic = false, enabled = true, minInstances = 8 }: { children: ReactNode; isolated?: boolean; static?: boolean; enabled?: boolean; minInstances?: number }) {
    const parentEnabled = useContext(MeshInstancingEnabled);
    const active = parentEnabled && enabled;
    const cellSize = useContext(SpatialCellSizeContext);
    const parent = useContext(MeshInstanceContext);
    const inherited = isolated ? null : parent;
    const registry = useMemo(() => inherited ?? new MeshInstanceRegistry(isStatic, cellSize, Math.max(2, minInstances)), [inherited, isStatic, cellSize, minInstances]);
    if (inherited) return children;
    return (
        <MeshInstancingEnabled.Provider value={active}><MeshInstanceContext.Provider value={registry}>
            {children}
            {active && <MeshInstanceBatches registry={registry} />}
        </MeshInstanceContext.Provider></MeshInstancingEnabled.Provider>
    );
}

export function useMeshInstanceRegistration(id: string, meshRef: RefObject<Mesh | null>, enabled: boolean) {
    const instancingEnabled = useContext(MeshInstancingEnabled);
    const registry = useContext(MeshInstanceContext);
    const onEditClick = useContext(EditPickContext);
    const editClick = useRef(onEditClick);
    useLayoutEffect(() => { editClick.current = onEditClick; }, [onEditClick]);
    useLayoutEffect(() => {
        const mesh = meshRef.current;
        if (!instancingEnabled || !registry || !mesh || !enabled || !mesh.geometry || !mesh.material || mesh.children.length > 0) return;
        return registry.register({
            id,
            mesh,
            onEditClick: event => editClick.current?.(event),
        });
    }, [enabled, instancingEnabled, id, meshRef, registry]);
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

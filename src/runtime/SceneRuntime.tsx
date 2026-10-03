import { createContext, useContext, type ReactNode } from 'react';
import { AssetRuntimeProvider } from './assets/AssetRuntime';
import { GeometryRuntimeProvider } from './components/GeometryComponent';
import { MaterialPoolProvider } from './components/MaterialComponent';
import { SceneComponentsProvider } from './scene/SceneContext';
import { SceneGraphRegistration } from './scene/SceneGraphRegistration';
import { DEFAULT_SPATIAL_CELL_SIZE } from './spatial/SpatialGrid';
import { MeshInstanceProvider, SpatialCellSizeContext } from './rendering/MeshInstanceProvider';
import { GameEventsProvider } from './scene/GameEvents';

const RuntimeContext = createContext(false);

/** Shared rendering resources and contexts, not a gameplay scheduler. Documents remain local to each prefab. */
export function SceneRuntime({ children, spatialCellSize = DEFAULT_SPATIAL_CELL_SIZE, instancing = true }: { children: ReactNode; spatialCellSize?: number; instancing?: boolean; }) {
    const inherited = useContext(RuntimeContext);
    if (inherited) return children;
    return <RuntimeContext.Provider value={true}>
        <SpatialCellSizeContext.Provider value={spatialCellSize}>
            <GameEventsProvider>
                <AssetRuntimeProvider>
                    <GeometryRuntimeProvider>
                        <MaterialPoolProvider>
                            <SceneComponentsProvider>
                                <SceneGraphRegistration />
                                <MeshInstanceProvider enabled={instancing}>{children}</MeshInstanceProvider>
                            </SceneComponentsProvider>
                        </MaterialPoolProvider>
                    </GeometryRuntimeProvider>
                </AssetRuntimeProvider>
            </GameEventsProvider>
        </SpatialCellSizeContext.Provider>
    </RuntimeContext.Provider>;
}

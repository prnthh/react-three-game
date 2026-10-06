import { createContext, useContext, type ReactNode } from 'react';
import { AssetRuntimeProvider } from './assets/AssetRuntime.js';
import { GeometryRuntimeProvider } from './components/GeometryComponent.js';
import { MaterialPoolProvider } from './components/MaterialComponent.js';
import { SceneComponentsProvider } from './scene/SceneContext.js';
import { DEFAULT_SPATIAL_CELL_SIZE } from './spatial/SpatialGrid.js';
import { MeshInstanceProvider, SpatialCellSizeContext } from './rendering/MeshInstanceProvider.js';
import { GameEventsProvider } from './scene/GameEvents.js';

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
                                <MeshInstanceProvider enabled={instancing}>{children}</MeshInstanceProvider>
                            </SceneComponentsProvider>
                        </MaterialPoolProvider>
                    </GeometryRuntimeProvider>
                </AssetRuntimeProvider>
            </GameEventsProvider>
        </SpatialCellSizeContext.Provider>
    </RuntimeContext.Provider>;
}

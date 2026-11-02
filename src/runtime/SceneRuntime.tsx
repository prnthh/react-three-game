import { createContext, useContext, type ReactNode } from 'react';
import { AssetRuntimeProvider } from './assets/AssetRuntime.js';
import { GeometryRuntimeProvider } from './components/GeometryComponent.js';
import { MaterialPoolProvider } from './components/MaterialComponent.js';
import { SceneComponentsProvider } from './scene/SceneContext.js';
import { GameEventsProvider } from './scene/GameEvents.js';
import { SpatialStreamingRuntime } from './prefabs/SpatialStreamingRuntime.js';

const RuntimeContext = createContext(false);

/** Shared rendering resources and contexts, not a gameplay scheduler. Documents remain local to each prefab. */
export function SceneRuntime({ children }: { children: ReactNode; }) {
    const inherited = useContext(RuntimeContext);
    if (inherited) return children;
    return <RuntimeContext.Provider value={true}>
        <GameEventsProvider>
            <AssetRuntimeProvider>
                <GeometryRuntimeProvider>
                    <MaterialPoolProvider>
                        <SceneComponentsProvider>
                            <SpatialStreamingRuntime>
                                {children}
                            </SpatialStreamingRuntime>
                        </SceneComponentsProvider>
                    </MaterialPoolProvider>
                </GeometryRuntimeProvider>
            </AssetRuntimeProvider>
        </GameEventsProvider>
    </RuntimeContext.Provider>;
}

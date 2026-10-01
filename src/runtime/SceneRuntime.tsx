import { createContext, useContext, type ReactNode } from 'react';
import { AssetRuntimeProvider } from './assets/AssetRuntime';
import { AudioRuntimeProvider } from './audio/AudioRuntime';
import { GeometryRuntimeProvider } from './components/GeometryComponent';
import { MaterialPoolProvider } from './components/MaterialComponent';
import { SceneComponentsProvider } from './scene/SceneContext';
import { MeshInstanceProvider } from './rendering/MeshInstanceProvider';
import { GameEventsProvider } from './scene/GameEvents';

const RuntimeContext = createContext(false);

/** Shared rendering resources and contexts, not a gameplay scheduler. Documents remain local to each prefab. */
export function SceneRuntime({ children }: { children: ReactNode; }) {
    const inherited = useContext(RuntimeContext);
    if (inherited) return children;
    return <RuntimeContext.Provider value={true}>
        <GameEventsProvider>
            <AssetRuntimeProvider>
                <AudioRuntimeProvider>
                    <GeometryRuntimeProvider>
                        <MaterialPoolProvider>
                            <SceneComponentsProvider>
                                <MeshInstanceProvider>{children}</MeshInstanceProvider>
                            </SceneComponentsProvider>
                        </MaterialPoolProvider>
                    </GeometryRuntimeProvider>
                </AudioRuntimeProvider>
            </AssetRuntimeProvider>
        </GameEventsProvider>
    </RuntimeContext.Provider>;
}

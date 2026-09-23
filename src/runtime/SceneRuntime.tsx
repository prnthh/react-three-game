import { createContext, useContext, type ReactNode } from 'react';
import { AssetRuntimeProvider } from '../tools/prefabeditor/assetRuntime';
import { AudioRuntimeProvider } from '../tools/prefabeditor/AudioRuntime';
import { GeometryRuntimeProvider } from '../tools/prefabeditor/components/GeometryComponent';
import { MaterialPoolProvider } from '../tools/prefabeditor/components/MaterialComponent';
import { SceneComponentsProvider } from '../tools/prefabeditor/SceneContext';
import { MeshInstanceProvider } from '../tools/prefabeditor/MeshInstanceProvider';
import { GameEventsProvider } from '../tools/prefabeditor/GameEvents';

const RuntimeContext = createContext(false);

/** Nested roots share the outer runtime; documents remain local to each prefab. */
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

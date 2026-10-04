import { GameCanvas, PrefabRoot, registerComponent, type PrefabInstanceStatus } from 'react-three-game/viewer';
import { useCallback, useState } from 'react';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import type { Prefab } from 'react-three-game/core';
import { BASE_PATH } from '../basePath';
import homePrefab from '../../public/prefabs/brutalist-city/game-level.json';
import ConstantVelocityComponent from './ConstantVelocityComponent';
import PrefabGridStreamerComponent, { DemoChunkStatusContext } from './PrefabGridStreamerComponent';
import CameraShadowFollowerComponent from '../demo/grassworld/components/CameraShadowFollowerComponent';

registerComponent(ConstantVelocityComponent);
registerComponent(PrefabGridStreamerComponent);
registerComponent(CameraShadowFollowerComponent);

export default function DemoApp() {
    const [error, setError] = useState<string | null>(null);
    const status = useCallback((value: PrefabInstanceStatus) => {
        if (value.phase === 'error') setError(String(value.error));
    }, []);
    return <DemoChunkStatusContext.Provider value={status}>
        <GameCanvas rendererConfig={{ outputColorSpace: SRGBColorSpace, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.2 }}>
            <PrefabRoot basePath={BASE_PATH} data={homePrefab as Prefab} />
        </GameCanvas>
        {error && <div role="alert" className="absolute bottom-4 left-4 text-sm text-red-300">Scene failed to load: {error}</div>}
    </DemoChunkStatusContext.Provider>;
}

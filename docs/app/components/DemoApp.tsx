import { GameCanvas, PrefabRoot, registerComponent, type PrefabInstanceStatus } from 'react-three-game/viewer';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Prefab } from 'react-three-game/core';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { withBasePath, BASE_PATH } from '../basePath';
import ConstantVelocityComponent from './ConstantVelocityComponent';
import PrefabGridStreamerComponent, { DemoChunkStatusContext } from './PrefabGridStreamerComponent';
import CameraShadowFollowerComponent from '../demo/grassworld/components/CameraShadowFollowerComponent';

registerComponent(ConstantVelocityComponent);
registerComponent(PrefabGridStreamerComponent);
registerComponent(CameraShadowFollowerComponent);

export default function DemoApp({ onReady }: { onReady: () => void }) {
    const [prefab, setPrefab] = useState<Prefab | null>(null);
    const [error, setError] = useState<string | null>(null);
    const notified = useRef(false);
    const status = useCallback((value: PrefabInstanceStatus) => {
        if (value.phase === 'error') setError(String(value.error));
        if (value.phase === 'active' && !notified.current) {
            notified.current = true;
            performance.measure('home:first-chunk-active', { start: 'home:load-start' });
            onReady();
        }
    }, [onReady]);
    useEffect(() => {
        const controller = new AbortController();
        performance.mark('home:load-start');
        void fetch(withBasePath('/prefabs/game-level.json'), { signal: controller.signal })
            .then(response => {
                if (!response.ok) throw new Error(`Scene request failed (${response.status})`);
                return response.json();
            }).then(setPrefab).catch(error => {
                if (!controller.signal.aborted) setError(String(error));
            });
        return () => controller.abort();
    }, []);
    if (error) return <div role="alert" className="absolute bottom-4 left-4 text-sm text-red-300">Scene failed to load: {error}</div>;
    return <DemoChunkStatusContext.Provider value={status}>
        <GameCanvas rendererConfig={{ outputColorSpace: SRGBColorSpace, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.2 }}>
            {prefab && <PrefabRoot basePath={BASE_PATH} data={prefab} />}
        </GameCanvas>
    </DemoChunkStatusContext.Provider>;
}

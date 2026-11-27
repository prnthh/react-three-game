'use client';
import { memo } from 'react';
import { GameCanvas, PrefabRoot, registerComponent } from 'react-three-game/viewer';
import type { Prefab } from 'react-three-game/core';
import { BASE_PATH } from '../basePath';
import homePrefab from '../../public/prefabs/brutalist-city/game-level.json';
import DistrictRouteComponent from './DistrictRouteComponent';
import { CityDebugLog, CityProfiling } from './cityProfiling';

import { FrameSampler, type FrameSample } from './FrameSampler';

registerComponent(DistrictRouteComponent);

export default memo(function DemoApp({ onFrameSample }: { onFrameSample?: (sample: FrameSample) => void }) {
    const profiling = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
    return <div className="absolute inset-0 -z-1 h-full w-full bg-[#677d83]">
        <GameCanvas>
            {profiling && <CityDebugLog />}
            {onFrameSample && <FrameSampler onSample={onFrameSample} />}
            <CityProfiling.Provider value={profiling}>
                <PrefabRoot basePath={BASE_PATH} data={homePrefab as Prefab} />
            </CityProfiling.Provider>
        </GameCanvas>
    </div>;
});

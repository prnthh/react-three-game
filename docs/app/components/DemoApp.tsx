'use client';

import { GameCanvas, PrefabRoot, registerComponent } from 'react-three-game/viewer';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import type { Prefab } from 'react-three-game/core';
import { BASE_PATH } from '../basePath';
import homePrefab from '../../public/prefabs/brutalist-city/game-level.json';
import ConstantVelocityComponent from './ConstantVelocityComponent';
import PrefabGridStreamerComponent from './PrefabGridStreamerComponent';
import CameraShadowFollowerComponent from '../demo/grassworld/components/CameraShadowFollowerComponent';

registerComponent(ConstantVelocityComponent);
registerComponent(PrefabGridStreamerComponent);
registerComponent(CameraShadowFollowerComponent);

export default function DemoApp() {
    return <div className="absolute inset-0 -z-1 h-full w-full bg-[#a2b9ce]">
        <GameCanvas rendererConfig={{ outputColorSpace: SRGBColorSpace, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.2 }}>
            <PrefabRoot basePath={BASE_PATH} data={homePrefab as Prefab} />
        </GameCanvas>
    </div>;
}

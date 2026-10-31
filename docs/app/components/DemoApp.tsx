'use client';

import { useEffect, useMemo } from 'react';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { GameCanvas, PrefabRoot, registerComponent, type ComponentViewProps } from 'react-three-game/viewer';
import { AgXToneMapping, SRGBColorSpace } from 'three';
import type { Prefab } from 'react-three-game/core';
import { BASE_PATH } from '../basePath';
import homePrefab from '../../public/prefabs/brutalist-city/game-level.json';
import WebGPUPostProcessing from './WebGPUPostProcessing';
import ConstantVelocityComponent from './ConstantVelocityComponent';
import PrefabGridStreamerComponent from './PrefabGridStreamerComponent';

// A regular prefab view: Environment captures this small sky once for lighting and background.
function HomeSky({ properties, children }: ComponentViewProps<{ sunPosition: [number, number, number] }>) {
    const [x, y, z] = properties.sunPosition;
    const sky = useMemo(() => {
        const sky = new SkyMesh();
        sky.scale.setScalar(450);
        sky.sunPosition.value.set(x, y, z);
        sky.turbidity.value = 4;
        sky.rayleigh.value = 2;
        sky.showSunDisc.value = 0;
        return sky;
    }, [x, y, z]);
    useEffect(() => () => { sky.geometry.dispose(); sky.material.dispose(); }, [sky]);
    return <><primitive object={sky} />{children}</>;
}
registerComponent({ name: 'HomeSky', category: 'lighting', View: HomeSky,
    properties: { sunPosition: { type: 'vector3', default: [-60, 30, 45] } } });

registerComponent(ConstantVelocityComponent);
registerComponent(PrefabGridStreamerComponent);

export default function DemoApp() {
    return <div className="absolute inset-0 -z-1 h-full w-full bg-[#a2b9ce]">
        <GameCanvas rendererConfig={{ outputColorSpace: SRGBColorSpace, toneMapping: AgXToneMapping, toneMappingExposure: 1.15 }}>
            <PrefabRoot basePath={BASE_PATH} data={homePrefab as Prefab} />
            <WebGPUPostProcessing ambientOcclusionRadius={3} ambientOcclusionIntensity={0.65} />
        </GameCanvas>
    </div>;
}

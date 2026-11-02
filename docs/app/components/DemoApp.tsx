'use client';
import { GameCanvas, PrefabRoot, registerComponent } from 'react-three-game/viewer';
import type { Prefab } from 'react-three-game/core';
import { BASE_PATH } from '../basePath';
import homePrefab from '../../public/prefabs/brutalist-city/game-level.json';
import PrefabGridStreamerComponent from './PrefabGridStreamerComponent';

registerComponent(PrefabGridStreamerComponent);

export default function DemoApp() {
    return <div className="absolute inset-0 -z-1 h-full w-full bg-[#677d83]">
        <GameCanvas>
            <PrefabRoot basePath={BASE_PATH} data={homePrefab as Prefab} />
        </GameCanvas>
    </div>;
}

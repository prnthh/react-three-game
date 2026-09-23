'use client';

import Link from 'next/link';
import { registerComponent, type Prefab } from 'react-three-game/viewer';
import CutsceneRunner from '../../../components/cutscene/CutsceneRunner';
import { PrefabEditor } from 'react-three-game/editor';
import { BASE_PATH } from '../../../basePath';
import scene from '../../../../public/prefabs/infinite-tv.json';

registerComponent(CutsceneRunner);

export default function InfiniteTVEditor() {
    return <main className="flex h-dvh flex-col bg-zinc-950 text-zinc-100">
        <header className="flex h-12 shrink-0 items-center gap-5 border-b border-zinc-800 px-5 text-sm">
            <Link href="/demo/infinite-tv" className="text-lime-200">← Back to Infinite TV</Link>
            <span>Infinite TV · Set editor</span>
            <span className="ml-auto text-xs text-zinc-400">Export JSON to save the set</span>
        </header>
        <div className="relative min-h-0 flex-1">
            <PrefabEditor prefab={scene as Prefab} basePath={BASE_PATH} canvasProps={{ camera: { position: [0, 4, 10] } }} />
        </div>
    </main>;
}

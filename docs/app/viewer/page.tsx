'use client';

import { OrbitControls } from '@react-three/drei';
import { GameCanvas, PrefabRoot, registerComponent } from 'react-three-game/viewer';
import Rotator from '../demo/customcomponent/components/RotatorComponent';
import { rotatorScene } from '../demo/customcomponent/scene';
import { BASE_PATH } from '../basePath';

registerComponent(Rotator);

export default function ViewerDemo() {
    return <main className="h-screen w-screen bg-slate-950 text-white">
        <GameCanvas camera={{ position: [8, 7, 12] }}>
            <color attach="background" args={['#17232d']} />
            <ambientLight intensity={2} />
            <directionalLight position={[4, 6, 3]} intensity={2} />
            <PrefabRoot data={rotatorScene} basePath={BASE_PATH} />
            <OrbitControls makeDefault />
        </GameCanvas>
    </main>;
}

'use client';

import { registerComponent } from 'react-three-game/viewer';
import type { Prefab } from 'react-three-game/core';
import { PrefabEditor, registerComponentEditor } from 'react-three-game/editor';
import { CrashcatPhysicsComponent, CrashcatRagdollComponent, CrashcatRuntime } from 'react-three-game/plugins/crashcat';
import InteriorMap from './components/InteriorMapComponent';
import InteriorInspector from './components/InteriorMapComponent.editor';
import { SimplePlayerComponent } from './components/SimplePlayerComponent';
import coolStuffScene from './scene.json';
import { BASE_PATH } from '../../basePath';

registerComponent(InteriorMap);
registerComponentEditor(InteriorMap, InteriorInspector);
registerComponent(CrashcatPhysicsComponent);
registerComponent(CrashcatRagdollComponent);
registerComponent(SimplePlayerComponent);

export default function CoolStuffDemo() {
    return <main className="h-screen w-screen">
        <PrefabEditor agentId="cool-stuff" basePath={BASE_PATH} prefab={coolStuffScene as Prefab}
            canvasProps={{ camera: { position: [12, 20, 44], fov: 50, far: 250 } }}>
            <color attach="background" args={['#17232d']} />
            <ambientLight intensity={1.8} />
            <directionalLight position={[6, 18, 10]} intensity={2.5} />
            <CrashcatRuntime />
        </PrefabEditor>
    </main>;
}

'use client';

import { registerComponent } from 'react-three-game/viewer';
import type { Prefab } from 'react-three-game/core';
import { PrefabEditor, registerComponentEditor } from 'react-three-game/editor';
import { CrashcatPhysicsComponent, CrashcatRagdollComponent, CrashcatRuntime, TerrainPhysicsComponent, TerrainPhysicsRuntime } from 'react-three-game/plugins/crashcat';
import InteriorMap from './components/InteriorMapComponent';
import InteriorInspector from './components/InteriorMapComponent.editor';
import { SimplePlayerComponent } from './components/SimplePlayerComponent';
import villageScene from '../../../public/prefabs/village/village.json';
import { BASE_PATH } from '../../basePath';

registerComponent(InteriorMap);
registerComponentEditor(InteriorMap, InteriorInspector);
registerComponent(CrashcatPhysicsComponent);
registerComponent(CrashcatRagdollComponent);
registerComponent(SimplePlayerComponent);
registerComponent(TerrainPhysicsComponent);

export default function VillageDemo() {
    return <main className="h-screen w-screen">
        <PrefabEditor basePath={BASE_PATH} prefab={villageScene as Prefab}
            canvasProps={{ camera: { position: [24, 20, 32], fov: 50, far: 250 } }}>
            <color attach="background" args={['#bed2ce']} />
            <ambientLight intensity={1.8} />
            <directionalLight position={[6, 18, 10]} intensity={2.5} />
            <CrashcatRuntime><TerrainPhysicsRuntime activeLimit={1} /></CrashcatRuntime>
        </PrefabEditor>
    </main>;
}

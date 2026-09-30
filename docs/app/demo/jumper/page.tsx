'use client';

import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import type { PointLight } from 'three';
import { registerComponent, useScene, PrefabEditorMode, type Prefab } from 'react-three-game/viewer';
import { PrefabEditor } from 'react-three-game/editor';
import { BASE_PATH, withBasePath } from '../../basePath';
import { CharacterComponent } from './components/CharacterComponent';
import { SurfaceComponent } from './components/SurfaceComponent';
import { ConcreteComponent } from './components/ConcreteComponent';
import { RuinGeometryComponent } from './components/RuinGeometryComponent';

registerComponent(CharacterComponent);
registerComponent(SurfaceComponent);
registerComponent(ConcreteComponent);
registerComponent(RuinGeometryComponent);

// Course geometry and lights are static during play. Editing keeps shadows live.
function CourseShadows() {
    const { scene } = useThree();
    const { mode } = useScene();
    useEffect(() => {
        const lights: { light: PointLight; autoUpdate: boolean }[] = [];
        scene.traverse(object => {
            const light = object as PointLight;
            if (!light.isPointLight || !light.castShadow) return;
            lights.push({ light, autoUpdate: light.shadow.autoUpdate });
            light.shadow.autoUpdate = mode === PrefabEditorMode.Edit;
            light.shadow.needsUpdate = true;
        });
        return () => lights.forEach(({ light, autoUpdate }) => {
            light.shadow.autoUpdate = autoUpdate;
            light.shadow.needsUpdate = true;
        });
    }, [scene, mode]);
    return null;
}

export default function JumperDemo() {
    const [prefab, setPrefab] = useState<Prefab | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        const abort = new AbortController();
        const load = async (path: string) => {
            const response = await fetch(withBasePath(path), { signal: abort.signal });
            if (!response.ok) throw new Error(`Playground request failed: ${response.status}`);
            return response.json();
        };
        void load('/prefabs/jumper-course.json')
            .then((course: Prefab) => {
                if (abort.signal.aborted) return;
                setPrefab(course);
            }).catch(reason => { if (!abort.signal.aborted) setError(String(reason)); });
        return () => abort.abort();
    }, []);
    return <main style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#18180f', color: '#ddd7bd' }}>
        <div id="jumper-canvas" style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            {error ? <p role="alert">{error}</p> : !prefab ? <p>Loading playground…</p> :
                <PrefabEditor prefab={prefab} agentId="jumper" basePath={BASE_PATH} canvasProps={{ rendererConfig: { toneMappingExposure: 1.15 } }}>
                    <CourseShadows />
                    <color attach="background" args={['#171910']} />
                </PrefabEditor>}
        </div>
    </main>;
}

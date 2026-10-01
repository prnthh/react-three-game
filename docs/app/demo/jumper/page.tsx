'use client';

import { useEffect, useState } from 'react';
import { registerComponent, LightCullingGrid, type Prefab } from 'react-three-game/viewer';
import { PrefabEditor } from 'react-three-game/editor';
import { BASE_PATH, withBasePath } from '../../basePath';
import { CharacterComponent } from './components/CharacterComponent';
import { CollisionSurfaceComponent } from './components/CollisionSurfaceComponent';
import { ConcreteComponent } from './components/ConcreteComponent';
import WeatheredGeometryComponent from './components/WeatheredGeometryComponent';

registerComponent(CharacterComponent);
registerComponent(CollisionSurfaceComponent);
registerComponent(ConcreteComponent);
registerComponent(WeatheredGeometryComponent);

export default function JumperDemo() {
    const [prefab, setPrefab] = useState<Prefab | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        const abort = new AbortController();
        const load = async (path: string) => {
            const response = await fetch(withBasePath(path), { signal: abort.signal });
            if (!response.ok) throw new Error(`Jumper request failed: ${response.status}`);
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
            {error ? <p role="alert">{error}</p> : !prefab ? <p>Loading Jumper…</p> :
                <PrefabEditor prefab={prefab} basePath={BASE_PATH} canvasProps={{ rendererConfig: { toneMappingExposure: 1.15 } }}>
                    <LightCullingGrid cellSize={24} neighborRadius={1} />
                    <color attach="background" args={['#171910']} />
                </PrefabEditor>}
        </div>
    </main>;
}

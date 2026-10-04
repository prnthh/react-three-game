'use client';

import { useEffect, useState } from 'react';
import { registerComponent, LightCullingGrid, PrefabEditorMode, useScene, type Prefab } from 'react-three-game/viewer';
import { PrefabEditor } from 'react-three-game/editor';
import { BASE_PATH, withBasePath } from '../../basePath';
import { CharacterComponent } from './components/CharacterComponent';
import { CollisionSurfaceComponent } from './components/CollisionSurfaceComponent';
import { ConcreteMaterialComponent } from './components/ConcreteMaterialComponent';
import WeatheredGeometryComponent from './components/WeatheredGeometryComponent';
import WebGPUPostProcessing from '../../components/WebGPUPostProcessing';

registerComponent(CharacterComponent);
registerComponent(CollisionSurfaceComponent);
registerComponent(ConcreteMaterialComponent);
registerComponent(WeatheredGeometryComponent);

function ParkourPostProcessing() {
    const { mode } = useScene();
    if (mode !== PrefabEditorMode.Play) return null;
    return <WebGPUPostProcessing
        ambientOcclusion
        ambientOcclusionIntensity={0.65}
        ambientOcclusionRadius={0.25}
        ambientOcclusionResolutionScale={0.5}
        ambientOcclusionSamples={8}
    />;
}

export default function ParkourDemo() {
    const [prefab, setPrefab] = useState<Prefab | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        const abort = new AbortController();
        const load = async (path: string) => {
            const response = await fetch(withBasePath(path), { signal: abort.signal });
            if (!response.ok) throw new Error(`Parkour request failed: ${response.status}`);
            return response.json();
        };
        void load('/prefabs/parkour-course.json')
            .then((course: Prefab) => {
                if (abort.signal.aborted) return;
                setPrefab(course);
            }).catch(reason => { if (!abort.signal.aborted) setError(String(reason)); });
        return () => abort.abort();
    }, []);
    return <main style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#18180f', color: '#ddd7bd' }}>
        <div id="parkour-canvas" style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            {error ? <p role="alert">{error}</p> : !prefab ? <p>Loading Parkour…</p> :
                <PrefabEditor prefab={prefab} basePath={BASE_PATH} canvasProps={{ rendererConfig: { toneMappingExposure: 1.15 } }}>
                    <LightCullingGrid cellSize={24} neighborRadius={1} />
                    <ParkourPostProcessing />
                    <color attach="background" args={['#171910']} />
                </PrefabEditor>}
        </div>
    </main>;
}

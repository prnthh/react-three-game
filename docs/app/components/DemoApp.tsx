'use client';
import { useEffect, useMemo, useState } from 'react';
import type { WebGPURenderer } from 'three/webgpu';
import { GameCanvas, PrefabRoot, registerComponent } from 'react-three-game/viewer';
import type { Prefab } from 'react-three-game/core';
import { BASE_PATH } from '../basePath';
import homePrefab from '../../public/prefabs/brutalist-city/game-level.json';
import PrefabGridStreamerComponent from './PrefabGridStreamerComponent';
import { CityProfiling, profileCityRenderer } from './cityProfiling';

registerComponent(PrefabGridStreamerComponent);

export default function DemoApp() {
    const [profiling, setProfiling] = useState(false);
    const bench = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('profileRender');
    const [comparison, setComparison] = useState({ contact: false, occlusion: false, scale: 0 });
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        setProfiling(params.has('profileCity'));
        setComparison({ contact: params.get('ao') === 'contact', occlusion: params.has('chunkOcclusion'), scale: Number(params.get('aoScale')) });
    }, []);
    const prefab = useMemo<Prefab>(() => {
        if (!comparison.contact && !comparison.occlusion && !comparison.scale && !bench) return homePrefab as Prefab;
        const root = homePrefab.root;
        const post = root.components.postProcessing;
        return { ...homePrefab, root: { ...root,
            children: bench ? root.children.map(node => {
                const flythrough = node.components?.flythrough;
                return flythrough ? { ...node, components: { ...node.components, flythrough: {
                    ...flythrough, properties: { ...flythrough.properties, data: { speed: 0 } },
                } } } : node;
            }) : root.children,
            components: { ...root.components, postProcessing: {
                ...post, properties: { ...post.properties, ambientOcclusionMode: comparison.contact ? 'contact' : 'gtao',
                    ambientOcclusionResolutionScale: comparison.scale || post.properties.ambientOcclusionResolutionScale,
                    chunkOcclusion: comparison.occlusion },
            } },
        } } as Prefab;
    }, [bench, comparison]);
    return <div className="absolute inset-0 -z-1 h-full w-full bg-[#677d83]">
        <GameCanvas glConfig={bench ? { trackTimestamp: true } : undefined}
            onCreated={bench ? ({ gl }) => profileCityRenderer(gl as unknown as WebGPURenderer) : undefined}>
            <CityProfiling.Provider value={profiling}>
                <PrefabRoot basePath={BASE_PATH} data={prefab} />
            </CityProfiling.Provider>
        </GameCanvas>
    </div>;
}

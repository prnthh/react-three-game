import { GameCanvas, PrefabRoot, registerComponent } from "react-three-game/viewer";
import { useState, useEffect } from "react";
import type { Prefab } from "react-three-game/core";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { withBasePath, BASE_PATH } from "../basePath";
import ConstantVelocityComponent from "./ConstantVelocityComponent";
import PrefabGridStreamerComponent from "./PrefabGridStreamerComponent";
import InteriorMapComponent from "./InteriorMapComponent";
import WebGPUPostProcessing from "./WebGPUPostProcessing";

export default function DemoApp() {
    registerComponent(ConstantVelocityComponent);
    registerComponent(PrefabGridStreamerComponent);
    registerComponent(InteriorMapComponent);

    const [prefab, setPrefab] = useState<Prefab | null>(null);

    useEffect(() => {
        let mounted = true;
        fetch(withBasePath('/prefabs/game-level.json'))
            .then(r => r.json())
            .then(data => {
                if (mounted) setPrefab(data);
            });
        return () => {
            mounted = false;
        };
    }, []);

    return (
        <div className="absolute inset-0 -z-1 h-full w-full">
            <GameCanvas rendererConfig={{
                outputColorSpace: SRGBColorSpace,
                toneMapping: ACESFilmicToneMapping,
                toneMappingExposure: 1.2,
            }}>
                {prefab && <PrefabRoot basePath={BASE_PATH} data={prefab} />}
                {prefab && (
                    <WebGPUPostProcessing
                        ambientOcclusion
                        ambientOcclusionIntensity={0.3}
                        ambientOcclusionRadius={0.35}
                        ambientOcclusionResolutionScale={0.5}
                        ambientOcclusionSamples={8}
                        bloom
                        bloomStrength={0.2}
                        bloomRadius={0.3}
                        bloomThreshold={1}
                    />
                )}
            </GameCanvas>
        </div>
    );
} 

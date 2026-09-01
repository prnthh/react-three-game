import { GameCanvas, PrefabRoot, registerComponent, useScenePendingLoads } from "react-three-game/viewer";
import { useEffect, useState } from "react";
import type { Prefab } from "react-three-game/core";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { withBasePath, BASE_PATH } from "../basePath";
import ConstantVelocityComponent from "./ConstantVelocityComponent";
import PrefabGridStreamerComponent from "./PrefabGridStreamerComponent";
import InteriorMapComponent from "./InteriorMapComponent";

function SceneLoadReporter({ onReady }: { onReady: () => void }) {
    const pendingLoads = useScenePendingLoads();

    useEffect(() => {
        if (pendingLoads > 0) return;
        let finalFrame = 0;
        const firstFrame = requestAnimationFrame(() => {
            finalFrame = requestAnimationFrame(onReady);
        });
        return () => {
            cancelAnimationFrame(firstFrame);
            cancelAnimationFrame(finalFrame);
        };
    }, [onReady, pendingLoads]);

    return null;
}

export default function DemoApp({ onReady }: { onReady: () => void }) {
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
        <GameCanvas rendererConfig={{
            outputColorSpace: SRGBColorSpace,
            toneMapping: ACESFilmicToneMapping,
            toneMappingExposure: 1.2,
        }}>
            {prefab && <PrefabRoot basePath={BASE_PATH} data={prefab}><SceneLoadReporter onReady={onReady} /></PrefabRoot>}
        </GameCanvas>
    );
}

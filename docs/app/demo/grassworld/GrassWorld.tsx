import { useFrame } from "@react-three/fiber";
import { Color } from "three";

import Flowers from "./components/Flowers";
import Grass from "./components/Grass";
import { GameTime } from "./components/GrassWorldRuntime";
import StreamedTerrain from "./components/StreamedTerrain";
import Water from "./components/Water";

const FOG_COLOR = new Color().setRGB(0.4, 0.6, 0.3);

export type GrassWorldConfig = {
    mapSize: number;
    waterLevel: number;
    grassShoreClearance: number;
    grassTransitionWidth: number;
    terrainChunkSize: number;
    terrainChunkRadius: number;
};

export function terrainHeight(x: number, z: number) {
    const broad = Math.sin(x * 0.045) * 1.15 + Math.cos(z * 0.04) * 0.9;
    const crossing = Math.sin((x + z) * 0.08) * 0.45 + Math.cos((x - z) * 0.065) * 0.32;
    const detail = Math.sin(x * 0.19 + Math.cos(z * 0.12)) * 0.14;
    const shore = -2.2 + 3.6 / (1 + Math.exp(-(x + 17) * 0.26));
    return shore + broad + crossing + detail;
}

function GrassWorldScene({ config }: { config: GrassWorldConfig }) {
    useFrame((_, delta) => GameTime.update(delta), -10);

    return <>
        <fogExp2 attach="fog" args={[FOG_COLOR, 0.004]} />
        <Water level={config.waterLevel} size={config.mapSize} />
        <StreamedTerrain
            chunkRadius={config.terrainChunkRadius}
            chunkSize={config.terrainChunkSize}
            heightAt={terrainHeight}
            waterLevel={config.waterLevel}
        />
        <Grass
            heightAt={terrainHeight}
            waterLevel={config.waterLevel}
            mapSize={config.mapSize}
            shoreClearance={config.grassShoreClearance}
            transitionWidth={config.grassTransitionWidth}
        />
        <Flowers />
    </>;
}

export default function GrassWorld({ config }: { config: GrassWorldConfig }) {
    return <GrassWorldScene config={config} />;
}

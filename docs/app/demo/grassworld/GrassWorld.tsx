import { Color } from "three";

import { terrainHeight } from "./terrain";
export { terrainHeight } from "./terrain";
import StreamedTerrain from "./components/StreamedTerrain";

const FOG_COLOR = new Color().setRGB(0.4, 0.6, 0.3);

export type GrassWorldConfig = {
    mapSize: number;
    waterLevel: number;
    grassShoreClearance: number;
    grassTransitionWidth: number;
    terrainChunkSize: number;
    terrainChunkRadius: number;
};

export default function GrassWorld({ config }: { config: GrassWorldConfig }) {

    return <>
        <fogExp2 attach="fog" args={[FOG_COLOR, 0.004]} />
        <StreamedTerrain
            chunkRadius={config.terrainChunkRadius}
            chunkSize={config.terrainChunkSize}
            heightAt={terrainHeight}
            waterLevel={config.waterLevel}
            shoreClearance={config.grassShoreClearance}
            transitionWidth={config.grassTransitionWidth}
        />

    </>;
}

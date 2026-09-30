import { createNodeComponentType, useSceneComponents } from "react-three-game/viewer";
import { Vector3 } from "three";

export type PlayerRuntime = { position: Vector3 };
export const GRASS_WORLD_PLAYER_COMPONENT = createNodeComponentType<PlayerRuntime>("GrassWorldPlayer");

export function usePlayerRuntime() {
    return useSceneComponents(GRASS_WORLD_PLAYER_COMPONENT)[0]?.value;
}

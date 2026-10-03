import { createNodeComponentType, useSceneComponents, type GameObjectHandle } from "react-three-game/viewer";

// Resolve the player across nested character prefab scopes.
export const PLAYER = createNodeComponentType<GameObjectHandle>("stage:player");
export const usePlayer = () => useSceneComponents(PLAYER)[0]?.value;

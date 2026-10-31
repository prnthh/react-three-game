import type { Prefab } from "react-three-game/core";
import mapDocument from "./map.json" with { type: "json" };
import gameplayDocument from "./gameplay.json" with { type: "json" };
import { composeScene } from "./shared/map";

export const mapPrefab: Prefab = mapDocument;
export const gameplayPrefab: Prefab = gameplayDocument;
export const relayYardScene = composeScene(mapPrefab, gameplayPrefab);

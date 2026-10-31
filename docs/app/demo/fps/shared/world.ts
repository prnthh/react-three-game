import { PhysicsWorld } from "./physics";
import { compileMap, compileMapFeatures, compileSpawnPoints, type Vec, type Block } from "./map";
import mapPrefab from "../map.json" with { type: "json" };
export type { Vec, Block, SpawnPoint } from "./map";

// One shared compiled world for the local demo's rendering, audio and authority.
export const spawnPoints = compileSpawnPoints(mapPrefab);
export const blocks = compileMap(mapPrefab);
export const mapFeatures = compileMapFeatures(mapPrefab);

/** Static authored geometry is safe to share; live actor state never lives here. */
export const physics = new PhysicsWorld(blocks, mapFeatures.rooms);
export function wallDistance(origin: Vec, dir: Vec, max = 100, hit?: { block?: Block; normal?: Vec }) {
  return physics.ray(origin, dir, max, hit);
}
const hot = (import.meta as ImportMeta & { webpackHot?: { dispose(callback: () => void): void } }).webpackHot;
hot?.dispose(() => physics.dispose());

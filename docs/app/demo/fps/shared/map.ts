import type { Prefab, GameObject } from "react-three-game/core";
import mapDocument from "../map.json" with { type: "json" };
import gameplayDocument from "../gameplay.json" with { type: "json" };

export type Vec = [number, number, number];
export type Block = {
  id: string;
  p: Vec;
  size: Vec;
  color: string;
  kind?: "wall" | "crate" | "roof";
};
export const mapPrefab: Prefab = mapDocument;
export const gameplayPrefab: Prefab = gameplayDocument;

function vector(value: unknown, fallback: Vec): Vec {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite))
    throw new Error("Map vectors must contain three finite numbers");
  return value as Vec;
}

/** Preserve each document's root, transforms and references; never silently overwrite IDs. */
export function composeScene(...documents: Prefab[]): Prefab {
  const scene: Prefab = {
    id: "relay-yard", name: "Relay Yard",
    root: { id: "relay-yard-root", name: "Relay Yard", children: documents.map(doc => structuredClone(doc.root)) },
  };
  const ids = new Set<string>();
  const visit = (node: GameObject) => {
    if (ids.has(node.id)) throw new Error(`Duplicate scene node ID: ${node.id}`);
    ids.add(node.id);
    node.children?.forEach(visit);
  };
  for (const document of documents) {
    if (document.prefabs) throw new Error("Compose inline scene documents; external prefab definitions must be resolved first.");
  }
  visit(scene.root);
  return scene;
}

/** Compile the demo's axis-aligned collision from authored nodes, without React or Three. */
export function compileMap(document: Prefab): Block[] {
  const result: Block[] = [];
  const visit = (node: GameObject, position: Vec, scale: Vec, rotated: boolean) => {
    if (node.disabled) return;
    const components = Object.values(node.components ?? {});
    const props = (type: string) => components.find(c => c?.type === type)?.properties;
    const transform = props("Transform");
    const localPosition = vector(transform?.position, [0, 0, 0]);
    const localScale = vector(transform?.scale, [1, 1, 1]);
    const rotation = vector(transform?.rotation, [0, 0, 0]);
    const p = position.map((v, i) => v + localPosition[i] * scale[i]) as Vec;
    const s = scale.map((v, i) => v * localScale[i]) as Vec;
    const hasRotation = rotated || rotation.some(v => v !== 0);
    const collision = props("Data")?.data?.collision;
    if (collision) {
      const geometry = props("Geometry");
      if (hasRotation || geometry?.geometryType !== "box")
        throw new Error(`FPS collision requires an unrotated box: ${node.id}`);
      const size = vector(geometry.args, [1, 1, 1]).map((v, i) => Math.abs(v * s[i])) as Vec;
      if (size.some(v => v <= 0) || !["wall", "crate", "roof"].includes(collision.kind))
        throw new Error(`Invalid collision box: ${node.id}`);
      result.push({ id: node.id, p, size, color: props("Material")?.color ?? "#ffffff", kind: collision.kind });
    }
    node.children?.forEach(child => visit(child, p, s, hasRotation));
  };
  visit(document.root, [0, 0, 0], [1, 1, 1], false);
  return result;
}

export type SpawnPoint = { id: string; team: 0 | 1; position: Vec; yaw: number };

/** Spawn components use ordinary editor transforms, and need no rendering runtime. */
export function compileSpawnPoints(document: Prefab): SpawnPoint[] {
  const result: SpawnPoint[] = [];
  // Affine XZ basis supports nested yaw rotations and nonuniform scale.
  const visit = (node: GameObject, origin: Vec, basis: number[], heightScale: number, tilted: boolean) => {
    if (node.disabled) return;
    const props = (type: string) => Object.values(node.components ?? {}).find(c => c?.type === type)?.properties;
    const transform = props("Transform");
    const p = vector(transform?.position, [0, 0, 0]);
    const r = vector(transform?.rotation, [0, 0, 0]);
    const s = vector(transform?.scale, [1, 1, 1]);
    const [a, b, c, d] = basis, cos = Math.cos(r[1]), sin = Math.sin(r[1]);
    const position: Vec = [origin[0] + a * p[0] + b * p[2], origin[1] + p[1] * heightScale, origin[2] + c * p[0] + d * p[2]];
    const next = [(a * cos - b * sin) * s[0], (a * sin + b * cos) * s[2],
      (c * cos - d * sin) * s[0], (c * sin + d * cos) * s[2]];
    const hasTilt = tilted || r[0] !== 0 || r[2] !== 0;
    const spawn = props("FPSSpawnPoint");
    if (spawn) {
      const team = spawn.team ?? "alpha";
      if ((team !== "alpha" && team !== "bravo") || hasTilt || Math.hypot(next[1], next[3]) < 1e-8)
        throw new Error(`Spawn ${node.id} needs team alpha or bravo and an upright, nonzero transform`);
      result.push({ id: node.id, team: team === "bravo" ? 1 : 0, position, yaw: Math.atan2(next[1], next[3]) });
    }
    node.children?.forEach(child => visit(child, position, next, heightScale * s[1], hasTilt));
  };
  visit(document.root, [0, 0, 0], [1, 0, 0, 1], 1, false);
  for (const team of [0, 1]) {
    if (!result.some(point => point.team === team)) throw new Error(`Map needs an enabled spawn point for team ${team}`);
  }
  return result;
}

// One shared compiled world for the local demo's rendering, audio and authority.
export const spawnPoints = compileSpawnPoints(mapPrefab);
export const blocks = compileMap(mapPrefab);
export const relayYardScene = composeScene(mapPrefab, gameplayPrefab);

/** Ray/AABB slab intersection shared by shooting and bot sight. */
export function wallDistance(origin: Vec, dir: Vec, max = 100, hit?: { block?: Block }) {
  if (hit) hit.block = undefined;
  let closest = max;
  for (const b of blocks) {
    let lo = 0,
      hi = closest;
    for (let axis = 0; axis < 3; axis++) {
      const min = b.p[axis] - b.size[axis] / 2,
        max = b.p[axis] + b.size[axis] / 2;
      if (Math.abs(dir[axis]) < 1e-9) {
        if (origin[axis] < min || origin[axis] > max) {
          hi = -1;
          break;
        }
      } else {
        let a = (min - origin[axis]) / dir[axis],
          c = (max - origin[axis]) / dir[axis];
        if (a > c) [a, c] = [c, a];
        lo = Math.max(lo, a);
        hi = Math.min(hi, c);
      }
    }
    if (hi >= lo && lo < closest) { closest = lo; if (hit) hit.block = b; }
  }
  return closest;
}

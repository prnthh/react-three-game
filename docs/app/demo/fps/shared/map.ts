import { Vector3 } from "three";
import { getComponent, walkPrefabWorldTransforms, compileBoxCollider, compileMeshCollider, type WorldMeshCollider, type MeshColliderProperties, type WorldBox, type Prefab, type GameObject } from "react-three-game/core";

export type Vec = [number, number, number];
export type Block = (WorldBox | WorldMeshCollider) & {
  id: string;
  color: string;
  kind?: "wall" | "crate" | "roof" | "ground";
};

function vector(value: unknown, fallback: Vec): Vec {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite))
    throw new Error("Map vectors must contain three finite numbers");
  return value as Vec;
}

/** Preserve each document's root, transforms and references; never silently overwrite IDs. */
export function composeScene(...documents: Prefab[]): Prefab {
  const scene: Prefab = { id: 'relay-yard', name: 'Relay Yard', root: {
    id: 'relay-yard-root', name: 'Relay Yard', components: {}, children: documents.map(doc => structuredClone(doc.root)),
  } };
  const ids = new Set<string>();
  const visit = (node: GameObject) => {
    if (ids.has(node.id)) throw new Error('Duplicate scene node ID: ' + node.id);
    ids.add(node.id); node.children?.forEach(visit);
  };
  visit(scene.root);
  for (const root of scene.root.children!) for (const [key, component] of Object.entries(root.components ?? {})) {
    if (component && getComponent(component.type)?.scope === 'scene') {
      if (scene.root.components![key]) throw new Error('Conflicting scene setting: ' + key);
      scene.root.components![key] = component; delete root.components![key];
    }
  }
  return scene;
}


/** Physics shape dimensions are authored separately from render geometry. */
export function compileMap(document: Prefab): Block[] {
  const result: Block[] = [];
  walkPrefabWorldTransforms(document, (node, world) => {
    const components = Object.values(node.components ?? {});
    const data = components.find(c => c?.type === "Data")?.properties.data;
    for (const [key, component] of Object.entries(node.components ?? {})) {
      if (component?.type !== "BoxCollider" && component?.type !== "MeshCollider") continue;
      const kind = data?.collision?.kind;
      if (kind !== undefined && !["wall", "crate", "roof", "ground"].includes(kind)) throw new Error(`Invalid collision kind: ${node.id}`);
      const shape = component.type === "MeshCollider" ? compileMeshCollider(world, component.properties as unknown as MeshColliderProperties) : compileBoxCollider(world, component.properties);
      const multiple = components.filter(c => (c?.type === "BoxCollider" || c?.type === "MeshCollider")).length > 1;
      result.push({ ...shape, id: multiple ? `${node.id}/${key}` : node.id,
        color: components.find(c => c?.type === "Material")?.properties.color ?? "#ffffff", kind });
    }
  });
  return result;
}

export type MapRoom = WorldBox & { id: string; position: Vec; decay: number; hardFloor: boolean };
/** Room volumes and route markers use the same world transforms as collision. */
export function compileMapFeatures(document: Prefab) {
  const rooms: MapRoom[] = [], flanks: Vec[] = [];
  walkPrefabWorldTransforms(document, (node, world) => {
    const data = Object.values(node.components ?? {}).find(c => c?.type === "Data")?.properties.data;
    if (data?.audioRoom) {
      const room = data.audioRoom, decay = room.decay ?? 0.6;
      if (!Number.isFinite(decay) || decay <= 0 || decay > 5) throw new Error(`Invalid audio room: ${node.id}`);
      const shape = compileBoxCollider(world, { size: vector(room.size, [1, 1, 1]) });
      rooms.push({ ...shape, id: node.id, position: shape.p, decay, hardFloor: room.hardFloor === true });
    }
    if (data?.botFlank) flanks.push(new Vector3().setFromMatrixPosition(world).toArray() as Vec);
  });
  return { rooms, flanks };
}

export type SpawnPoint = { id: string; team: 0 | 1; position: Vec; yaw: number };

/** Spawn components use ordinary editor transforms, and need no rendering runtime. */
export function compileSpawnPoints(document: Prefab): SpawnPoint[] {
  const result: SpawnPoint[] = [];
  walkPrefabWorldTransforms(document, (node, world) => {
    const spawn = Object.values(node.components ?? {}).find(c => c?.type === "FPSSpawnPoint")?.properties;
    if (!spawn) return;
    const team = spawn.team ?? "alpha", e = world.elements;
    if ((team !== "alpha" && team !== "bravo") || [e[1], e[4], e[6], e[9]].some(v => Math.abs(v) > 1e-8)
        || Math.hypot(e[8], e[10]) < 1e-8 || e[5] <= 0)
      throw new Error(`Spawn ${node.id} needs team alpha or bravo and an upright, nonzero transform`);
    result.push({ id: node.id, team: team === "bravo" ? 1 : 0,
      position: new Vector3().setFromMatrixPosition(world).toArray() as Vec, yaw: Math.atan2(e[8], e[10]) });
  });
  for (const team of [0, 1]) {
    if (!result.some(point => point.team === team)) throw new Error(`Map needs an enabled spawn point for team ${team}`);
  }
  return result;
}

import { normalizePrefab, type PrefabState } from "./prefab.js";
import { findComponent, type Prefab, type GameObject } from "./types.js";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";

export function decompose(m: Matrix4) {
	const p = new Vector3();
	const q = new Quaternion();
	const s = new Vector3();
	m.decompose(p, q, s);
	const e = new Euler().setFromQuaternion(q);
	return {
		position: [p.x, p.y, p.z] as [number, number, number],
		rotation: [e.x, e.y, e.z] as [number, number, number],
		scale: [s.x, s.y, s.z] as [number, number, number],
	};
}

/** Build a local Matrix4 from position/rotation/scale arrays. */
export function composeTransform(
	position: [number, number, number] = [0, 0, 0],
	rotation: [number, number, number] = [0, 0, 0],
	scale: [number, number, number] = [1, 1, 1],
): Matrix4 {
	return new Matrix4().compose(
		new Vector3(...position),
		new Quaternion().setFromEuler(new Euler(...rotation)),
		new Vector3(...scale),
	);
}

/** Compute the parent world matrix for a node using the normalized store data */
export function computeParentWorldMatrix(
	state: Pick<PrefabState, "nodesById" | "parentIdById">,
	targetId: string,
) {
	const parentWorld = new Matrix4();
	for (let id = state.parentIdById[targetId]; id; id = state.parentIdById[id]) {
		const transform = findComponent(state.nodesById[id], "Transform")?.properties;
		parentWorld.premultiply(composeTransform(transform?.position, transform?.rotation, transform?.scale));
	}

	return parentWorld;
}

/** Match runtime PrefabRef semantics, including packed-root placement transforms.
 * The synchronous local compiler rejects URLs rather than silently omitting them. */
function resolvePrefabTree(document: Prefab): GameObject {
  let count = 0;
  const expand = (state: ReturnType<typeof normalizePrefab>, id: string, scope: string, ancestors: readonly string[]): GameObject => {
    if (++count > 100_000) throw new Error("Prefab expansion exceeds 100000 nodes");
    const source = state.nodesById[id];
    const node: GameObject = { ...source, id: scope ? `${scope}/${id}` : id };
    if (node.disabled) return node;
    const children: GameObject[] = [];
    for (const component of Object.values(source.components ?? {})) {
      if (component?.type !== "PrefabRef") continue;
      const { prefabId, url } = component.properties;
      if (prefabId) {
        const definition = state.prefabs?.[prefabId];
        if (!definition) throw new Error(`Unknown prefab: ${prefabId}`);
        if (ancestors.includes(prefabId)) throw new Error(`Cyclic prefab: ${prefabId}`);
        const nested = normalizePrefab(definition, state.prefabs);
        children.push(expand(nested, nested.rootId, node.id, [...ancestors, prefabId]));
      } else if (url) throw new Error(`Resolve external prefab before compilation: ${url}`);
    }
    for (const childId of state.childIdsById[id] ?? []) children.push(expand(state, childId, scope, ancestors));
    return { ...node, children };
  };
  const state = normalizePrefab(document);
  return expand(state, state.rootId, "", []);
}


/** Visit resolved authored nodes with exact world matrices, without mounting React.
 * Matrices retain shear from rotated children beneath nonuniformly scaled parents. */
export function walkPrefabWorldTransforms(document: Prefab, inspect: (node: GameObject, world: Matrix4) => void) {
    const vector = (value: unknown, fallback: [number, number, number]): [number, number, number] => {
        if (value === undefined) return fallback;
        if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new Error('Transform requires three finite numbers');
        return value as [number, number, number];
    };
    const visit = (node: GameObject, parent: Matrix4) => {
        if (node.disabled) return;
        const props = findComponent(node, 'Transform')?.properties;
        const world = parent.clone().multiply(composeTransform(vector(props?.position, [0, 0, 0]),
            vector(props?.rotation, [0, 0, 0]), vector(props?.scale, [1, 1, 1])));
        inspect(node, world);
        node.children?.forEach(child => visit(child, world));
    };
    visit(resolvePrefabTree(document), new Matrix4());
}

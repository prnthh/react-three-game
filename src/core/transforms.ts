import type { PrefabState } from "./prefab.js";
import { findComponent } from "./types.js";
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

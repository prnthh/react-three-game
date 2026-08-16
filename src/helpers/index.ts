import type { GameObject } from "../tools/prefabeditor/types";

export type Vec3 = [number, number, number];

export interface GroundOptions {
	/** GameObject id. Defaults to "ground". */
	id?: string;

	/** Plane size. Defaults to 50. */
	size?: number;

	/** Transform overrides. */
	position?: Vec3;
	rotation?: Vec3;
	scale?: Vec3;

	/** Material id from the prefab's shared materials list. */
	materialId?: string;

	/** Set true to disable the node. */
	disabled?: boolean;
}

/**
 * Create a ready-to-use plane ground GameObject.
 *
 * Designed to reduce prefab boilerplate:
 * - Transform (rotated to lie flat)
 * - Geometry (plane)
	 * - Shared Material reference
 */
export function ground(options: GroundOptions = {}): GameObject {
	const {
		id = "ground",
		size = 50,
		position = [0, 0, 0],
		rotation = [-Math.PI / 2, 0, 0],
		scale = [1, 1, 1],
		materialId = "default",
		disabled = false,
	} = options;

	return {
		id,
		disabled,
		components: {
			transform: {
				type: "Transform",
				properties: {
					position,
					rotation,
					scale,
				},
			},
			mesh: {
				type: "Mesh",
				properties: {},
			},
			geometry: {
				type: "Geometry",
				properties: {
					geometryType: "plane",
					args: [size, size],
				},
			},
			material: {
				type: "Material",
				properties: { materialId },
			},
		},
	};
}

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

	/** Material overrides. */
	color?: string;
	texture?: string;
	/** When true, set repeat wrapping. Defaults to true if texture is provided. */
	repeat?: boolean;
	/** Texture repeat counts when repeat=true. Defaults to [25,25]. */
	repeatCount?: [number, number];

	/** Physics body type. Defaults to "fixed". */
	physicsType?: "fixed" | "dynamic" | "kinematic";

	/** Set true to disable the node. */
	disabled?: boolean;
}

/**
 * Create a ready-to-use plane ground GameObject.
 *
 * Designed to reduce prefab boilerplate:
 * - Transform (rotated to lie flat)
 * - Geometry (plane)
 * - Material (optional texture + repeat)
 * - Physics (fixed by default)
 */
export function ground(options: GroundOptions = {}): GameObject {
	const {
		id = "ground",
		size = 50,
		position = [0, 0, 0],
		rotation = [-Math.PI / 2, 0, 0],
		scale = [1, 1, 1],
		color = "white",
		texture,
		repeat = texture ? true : false,
		repeatCount = [25, 25],
		physicsType = "fixed",
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
			geometry: {
				type: "Geometry",
				properties: {
					geometryType: "plane",
					args: [size, size],
				},
			},
			material: {
				type: "Material",
				properties: {
					color,
					...(texture ? { texture } : {}),
					...(repeat ? { repeat: true, repeatCount } : {}),
				},
			},
			physics: {
				type: "Physics",
				properties: {
					type: physicsType,
				},
			},
		},
	};
}

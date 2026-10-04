import { GameObject, Prefab } from "../core/types.js";
import { exportGLBData } from "../core/modelPrefab.js";
import { downloadBlob } from "../browser.js";
export { exportGLBData } from "../core/modelPrefab.js";
import {
	Box3,
	Object3D,
	PerspectiveCamera,
	Quaternion,
	Vector3,
} from "three";

export interface ExportGLBOptions {
	filename?: string;
}

/** Save scene JSON, showing a Save As dialog when supported */
export async function saveJson(data: Prefab, filename: string) {
	const json = JSON.stringify(data, null, 2);
	if ("showSaveFilePicker" in window) {
		try {
			const handle = await (window as any).showSaveFilePicker({
				suggestedName: `${filename || "scene"}.json`,
				types: [
					{ description: "JSON", accept: { "application/json": [".json"] } },
				],
			});
			const writable = await handle.createWritable();
			await writable.write(json);
			await writable.close();
			return;
		} catch (e: any) {
			if (e?.name === "AbortError") return; // user cancelled
		}
	}
	// Fallback for browsers without File System Access API
	downloadBlob(new Blob([json], { type: 'application/json' }), `${filename || "scene"}.json`);
}

/** Load scene JSON from a file */
export async function loadJson(): Promise<Prefab | undefined> {
	return (await loadJsonFile())?.prefab;
}

/** Load scene JSON from a file, also returning the original filename */
export function loadJsonFile(): Promise<
	{ prefab: Prefab; filename: string } | undefined
> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json,application/json";
		input.oncancel = () => resolve(undefined);
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return resolve(undefined);
			try {
				resolve({ prefab: JSON.parse(await file.text()) as Prefab, filename: file.name });
			} catch (error) {
				console.error("Error reading scene JSON:", error);
				resolve(undefined);
			}
		};
		input.click();
	});
}

/**
 * Export a Three.js scene or object to GLB and trigger a download
 */
export async function exportGLB(
	sceneRoot: Object3D,
	options: ExportGLBOptions = {},
): Promise<ArrayBuffer> {
	const { filename = "scene.glb" } = options;
	const data = await exportGLBData(sceneRoot);

	if (filename) {
		const blob = new Blob([data], { type: "application/octet-stream" });
		downloadBlob(blob, filename);
	}

	return data;
}

export function focusCameraOnObject(
	object: Object3D,
	camera: Object3D,
	target: Vector3,
	update?: () => void,
) {
	const bounds = new Box3().setFromObject(object);
	const center = new Vector3();
	const size = new Vector3();
	const quaternion = new Quaternion();
	object.getWorldQuaternion(quaternion);

	if (bounds.isEmpty()) {
		object.getWorldPosition(center);
		size.setScalar(1);
	} else {
		bounds.getCenter(center);
		bounds.getSize(size);
	}

	const radius = Math.max(size.length() * 0.5, 1);
	const forward = new Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
	const worldUp = new Vector3(0, 1, 0);
	const elevatedDirection = forward
		.clone()
		.addScaledVector(worldUp, 0.65)
		.normalize();
	const distance =
		camera instanceof PerspectiveCamera
			? Math.max(
					(radius / Math.tan((camera.fov * Math.PI) / 360)) * 1.8,
					radius * 3.5,
				)
			: radius * 4.5;
	const nextPosition = center
		.clone()
		.add(elevatedDirection.multiplyScalar(distance));

	camera.position.copy(nextPosition);
	camera.lookAt(center);
	target.copy(center);
	update?.();
}


export { computeParentWorldMatrix } from "../core/transforms.js";

/** Recursively update all IDs in a node tree */
export function regenerateIds(node: GameObject): GameObject {
	return {
		...node,
		id: crypto.randomUUID(),
		children: node.children?.map(regenerateIds),
	};
}

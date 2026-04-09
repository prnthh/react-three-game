import { GameObject, Prefab, findComponent } from "./types";
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { Box3, Euler, Matrix4, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';

export interface ExportGLBOptions {
    filename?: string;
}

/** Save scene JSON, showing a Save As dialog when supported */
export async function saveJson(data: Prefab, filename: string) {
    const json = JSON.stringify(data, null, 2);
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await (window as any).showSaveFilePicker({
                suggestedName: `${filename || 'scene'}.json`,
                types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
            });
            const writable = await handle.createWritable();
            await writable.write(json);
            await writable.close();
            return;
        } catch (e: any) {
            if (e?.name === 'AbortError') return; // user cancelled
        }
    }
    // Fallback for browsers without File System Access API
    const a = document.createElement('a');
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(json);
    a.download = `${filename || 'scene'}.json`;
    a.click();
}

/** Load scene JSON from a file */
export function loadJson(): Promise<Prefab | undefined> {
    return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = e => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return resolve(undefined);
            const reader = new FileReader();
            reader.onload = e => {
                try {
                    const text = e.target?.result;
                    if (typeof text === 'string') resolve(JSON.parse(text) as Prefab);
                } catch (err) {
                    console.error('Error parsing scene JSON:', err);
                    resolve(undefined);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });
}

/**
 * Export a Three.js scene or object to GLB binary data
 */
export function exportGLBData(sceneRoot: Object3D): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        new GLTFExporter().parse(
            sceneRoot,
            (result) => resolve(result as ArrayBuffer),
            (error) => reject(error),
            { binary: true }
        );
    });
}

/**
 * Export a Three.js scene or object to GLB and trigger a download
 */
export async function exportGLB(
    sceneRoot: Object3D,
    options: ExportGLBOptions = {}
): Promise<ArrayBuffer> {
    const { filename = 'scene.glb' } = options;
    const data = await exportGLBData(sceneRoot);

    if (filename) {
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
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
    const elevatedDirection = forward.clone().addScaledVector(worldUp, 0.65).normalize();
    const distance = camera instanceof PerspectiveCamera
        ? Math.max(radius / Math.tan((camera.fov * Math.PI) / 360) * 1.8, radius * 3.5)
        : radius * 4.5;
    const nextPosition = center.clone().add(elevatedDirection.multiplyScalar(distance));

    camera.position.copy(nextPosition);
    camera.lookAt(center);
    target.copy(center);
    update?.();
}

export function decompose(m: Matrix4) {
    const p = new Vector3(), q = new Quaternion(), s = new Vector3();
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
    state: {
        nodesById: Record<string, { components?: Record<string, { properties?: Record<string, any> } | undefined> }>;
        parentIdById: Record<string, string | null>;
    },
    targetId: string,
) {
    const parentWorld = new Matrix4();
    const chain: string[] = [];
    let currentId: string | null | undefined = state.parentIdById[targetId];

    while (currentId) {
        chain.unshift(currentId);
        currentId = state.parentIdById[currentId];
    }

    for (const nodeId of chain) {
        const transform = findComponent(state.nodesById[nodeId], "Transform")?.properties;
        parentWorld.multiply(composeTransform(
            transform?.position,
            transform?.rotation,
            transform?.scale,
        ));
    }

    return parentWorld;
}

/** Recursively update all IDs in a node tree */
export function regenerateIds(node: GameObject): GameObject {
    return {
        ...node,
        id: crypto.randomUUID(),
        children: node.children?.map(regenerateIds)
    };
}

function createNode(path: string, name: string | undefined, extraComponents: Record<string, { type: string; properties: any }>): GameObject {
    return {
        id: crypto.randomUUID(),
        name: name ?? path.replace(/^.*[\/]/, '').replace(/\.[^.]+$/, ''),
        components: {
            transform: {
                type: 'Transform',
                properties: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
            },
            ...extraComponents,
        }
    };
}

/** Create a GameObject node for a 3D model file */
export function createModelNode(filename: string, name?: string): GameObject {
    return createNode(filename, name, {
        model: {
            type: 'Model',
            properties: {
                filename,
                instanced: false,
                repeat: false,
                repeatAxes: [{ axis: 'x', count: 1, offset: 1 }]
            }
        }
    });
}

/** Create a GameObject node for an image as a textured plane */
export function createImageNode(texturePath: string, name?: string): GameObject {
    return createNode(texturePath, name, {
        geometry: {
            type: 'Geometry',
            properties: { geometryType: 'plane', args: [1, 1] }
        },
        material: {
            type: 'Material',
            properties: { color: '#ffffff', texture: texturePath }
        }
    });
}

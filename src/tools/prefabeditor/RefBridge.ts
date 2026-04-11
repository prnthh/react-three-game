import { Object3D } from "three";

/**
 * RefBridge — O(1) lookup from entity ID to live Three.js Object3D.
 *
 * In play mode the Scene API writes directly to these refs, bypassing
 * React reconciliation.  In edit mode the store path is used instead.
 *
 * Component Views register/unregister refs on mount/unmount via
 * `bridge.register(id, obj)` / `bridge.unregister(id)`.
 */
export interface RefBridge {
    register: (id: string, obj: Object3D | null) => void;
    unregister: (id: string) => void;
    get: (id: string) => Object3D | null;
    /** Apply a transform component's properties directly to the Object3D. */
    setTransform: (id: string, position?: number[], rotation?: number[], scale?: number[]) => void;
    /** Read current transform from the Object3D back into a properties bag. */
    readTransform: (id: string) => { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] } | null;
}

export function createRefBridge(): RefBridge {
    const refs = new Map<string, Object3D>();

    return {
        register(id, obj) {
            if (obj) {
                refs.set(id, obj);
            } else {
                refs.delete(id);
            }
        },
        unregister(id) {
            refs.delete(id);
        },
        get(id) {
            return refs.get(id) ?? null;
        },
        setTransform(id, position, rotation, scale) {
            const obj = refs.get(id);
            if (!obj) return;

            if (position) {
                obj.position.set(position[0], position[1], position[2]);
            }
            if (rotation) {
                obj.rotation.set(rotation[0], rotation[1], rotation[2]);
            }
            if (scale) {
                obj.scale.set(scale[0], scale[1], scale[2]);
            }
        },
        readTransform(id) {
            const obj = refs.get(id);
            if (!obj) return null;

            return {
                position: [obj.position.x, obj.position.y, obj.position.z],
                rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
                scale: [obj.scale.x, obj.scale.y, obj.scale.z],
            };
        },
    };
}

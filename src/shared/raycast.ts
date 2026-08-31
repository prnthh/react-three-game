import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';
import {
    BufferAttribute,
    BufferGeometry,
    InterleavedBufferAttribute,
    Mesh,
    SkinnedMesh,
    type Object3D,
} from 'three';

const MIN_BVH_TRIANGLES = 32;
let installed = false;
let queueScheduled = false;

interface GeometryRevision {
    position: BufferAttribute | InterleavedBufferAttribute;
    positionVersion: number;
    index: BufferAttribute | null;
    indexVersion: number;
}

type AnyBufferGeometry = BufferGeometry<any>;

const builtRevisions = new WeakMap<AnyBufferGeometry, GeometryRevision>();
const pendingGeometries = new Map<AnyBufferGeometry, GeometryRevision>();

export function installBVHRaycasting() {
    if (installed) return;
    installed = true;
    Mesh.prototype.raycast = acceleratedRaycast;
}

function getAttributeVersion(attribute: BufferAttribute | InterleavedBufferAttribute) {
    return 'version' in attribute ? attribute.version : attribute.data.version;
}

function readRevision(geometry: AnyBufferGeometry): GeometryRevision | null {
    const position = geometry.getAttribute('position');
    if (!(position instanceof BufferAttribute) && !(position instanceof InterleavedBufferAttribute)) return null;
    const index = geometry.getIndex();
    const triangleCount = Math.floor((index?.count ?? position.count) / 3);
    if (triangleCount < MIN_BVH_TRIANGLES) return null;
    return {
        position,
        positionVersion: getAttributeVersion(position),
        index,
        indexVersion: index?.version ?? -1,
    };
}

function sameRevision(left: GeometryRevision | undefined, right: GeometryRevision) {
    return left?.position === right.position
        && left.positionVersion === right.positionVersion
        && left.index === right.index
        && left.indexVersion === right.indexVersion;
}

function flushGeometryQueue(deadline?: IdleDeadline) {
    queueScheduled = false;
    let processed = 0;

    for (const [geometry, requestedRevision] of pendingGeometries) {
        if (processed > 0 && deadline && deadline.timeRemaining() < 2) break;

        pendingGeometries.delete(geometry);
        const currentRevision = readRevision(geometry);
        if (!currentRevision) continue;
        if (!sameRevision(requestedRevision, currentRevision)) {
            pendingGeometries.set(geometry, currentRevision);
            continue;
        }
        if (geometry.boundsTree && sameRevision(builtRevisions.get(geometry), currentRevision)) {
            continue;
        }

        geometry.boundsTree = new MeshBVH(geometry, {
            // Models and repeated instances commonly share geometry. Keep its
            // index stable instead of letting the BVH reorder it in place.
            indirect: true,
        }) as unknown as NonNullable<typeof geometry.boundsTree>;
        builtRevisions.set(geometry, currentRevision);
        processed += 1;

        // Timer fallback yields after one build. A real idle period may use its
        // remaining budget without competing with the render loop.
        if (!deadline) break;
    }

    if (pendingGeometries.size > 0) scheduleQueueFlush();
}

function scheduleQueueFlush() {
    if (queueScheduled || pendingGeometries.size === 0) return;
    queueScheduled = true;
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(flushGeometryQueue, { timeout: 100 });
        return;
    }
    setTimeout(() => flushGeometryQueue(), 0);
}

/** Queue a BVH rebuild outside the render loop when geometry data changes. */
export function scheduleGeometryRaycast(geometry: AnyBufferGeometry) {
    installBVHRaycasting();
    if (geometry.userData.raycastBVH === false) return;
    const revision = readRevision(geometry);
    if (!revision) return;
    if (geometry.boundsTree && sameRevision(builtRevisions.get(geometry), revision)) return;
    if (geometry.boundsTree) geometry.boundsTree = undefined;
    pendingGeometries.set(geometry, revision);
    scheduleQueueFlush();
}

/** Queue every static mesh below an object once, normally when a model mounts. */
export function scheduleObjectRaycast(root: Object3D | null | undefined) {
    if (!root) return;
    root.traverse((object) => {
        if (!(object instanceof Mesh) || object instanceof SkinnedMesh) return;
        scheduleGeometryRaycast(object.geometry);
    });
}

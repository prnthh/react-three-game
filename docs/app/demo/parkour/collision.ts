export type Position = [number, number, number];
export type SurfaceOrientation = {
    center: Position;
    halfSize: Position;
    quaternion: [number, number, number, number];
};
export type Surface = {
    minX: number; maxX: number; minZ: number; maxZ: number; top: number; bottom?: number;
    orientation?: SurfaceOrientation;
};

export const PLAYER_RADIUS = 0.3;

// Upright boxes collide in their own horizontal frame. Tilted boxes retain
// the conservative bounds fallback; their sloping top faces are handled below.
function createWallFrame(surface: Surface) {
    const orientation = surface.orientation;
    if (orientation) {
        const up = rotateByQuaternion([0, 1, 0], orientation.quaternion);
        if (Math.abs(up[0]) < 1e-6 && Math.abs(up[2]) < 1e-6 && up[1] > 0) {
            const axis = rotateByQuaternion([1, 0, 0], orientation.quaternion);
            return { x: orientation.center[0], z: orientation.center[2], cosYaw: axis[0], sinYaw: axis[2], halfWidth: orientation.halfSize[0], halfDepth: orientation.halfSize[2] };
        }
    }
    return { x: (surface.minX + surface.maxX) / 2, z: (surface.minZ + surface.maxZ) / 2,
        cosYaw: 1, sinYaw: 0, halfWidth: (surface.maxX - surface.minX) / 2, halfDepth: (surface.maxZ - surface.minZ) / 2 };
}
// Only static grid surfaces are prepared. Raw surface arrays stay uncached.
const preparedGeometry = new WeakMap<Surface, ReturnType<typeof createSurfaceGeometry>>();
function createSurfaceGeometry(surface: Surface) {
    const orientation = surface.orientation;
    const topNormal = orientation ? rotateByQuaternion([0, 1, 0], orientation.quaternion) : [0, 1, 0];
    const topOffset = orientation ? rotateByQuaternion([0, orientation.halfSize[1], 0], orientation.quaternion) : null;
    const inverseQuaternion: SurfaceOrientation['quaternion'] | null = orientation
        ? [-orientation.quaternion[0], -orientation.quaternion[1], -orientation.quaternion[2], orientation.quaternion[3]] : null;
    return { frame: createWallFrame(surface), topNormal, topOffset, inverseQuaternion };
}
export function prepareSurfaceGeometry(surface: Surface) {
    preparedGeometry.set(surface, createSurfaceGeometry(surface));
}
function wallFrame(surface: Surface) {
    return preparedGeometry.get(surface)?.frame ?? createWallFrame(surface);
}
function wallPoint(x: number, z: number, frame: ReturnType<typeof wallFrame>) {
    return [(x - frame.x) * frame.cosYaw + (z - frame.z) * frame.sinYaw, -(x - frame.x) * frame.sinYaw + (z - frame.z) * frame.cosYaw];
}
export function overlaps(x: number, z: number, surface: Surface, radius = PLAYER_RADIUS) {
    const frame = wallFrame(surface), [localX, localZ] = wallPoint(x, z, frame);
    return Math.abs(localX) < frame.halfWidth + radius - 1e-6 && Math.abs(localZ) < frame.halfDepth + radius - 1e-6;
}
export function touchesHeight(y: number, height: number, surface: Surface) {
    return y < surface.top - 0.01 && y + height > (surface.bottom ?? -Infinity) + 0.01;
}

function rotateByQuaternion([x, y, z]: Position, [quaternionX, quaternionY, quaternionZ, quaternionW]: SurfaceOrientation['quaternion']): Position {
    const productX = quaternionW * x + quaternionY * z - quaternionZ * y;
    const productY = quaternionW * y + quaternionZ * x - quaternionX * z;
    const productZ = quaternionW * z + quaternionX * y - quaternionY * x;
    const productW = -quaternionX * x - quaternionY * y - quaternionZ * z;
    return [
        productX * quaternionW + productW * -quaternionX + productY * -quaternionZ - productZ * -quaternionY,
        productY * quaternionW + productW * -quaternionY + productZ * -quaternionX - productX * -quaternionZ,
        productZ * quaternionW + productW * -quaternionZ + productX * -quaternionY - productY * -quaternionX,
    ];
}

/** Height of a surface's actual rotated top face at a world-space X/Z point. */
export function surfaceTopAt(surface: Surface, x: number, z: number, radius = 0) {
    const orientation = surface.orientation;
    if (!orientation) {
        return x + radius > surface.minX + 1e-6 && x - radius < surface.maxX - 1e-6
            && z + radius > surface.minZ + 1e-6 && z - radius < surface.maxZ - 1e-6 ? surface.top : null;
    }

    const { center, halfSize } = orientation;
    const geometry = preparedGeometry.get(surface) ?? createSurfaceGeometry(surface);
    const normal = geometry.topNormal;
    if (normal[1] <= 1e-4) return null;
    const topCenterOffset = geometry.topOffset!;
    const topCenter: Position = [center[0] + topCenterOffset[0], center[1] + topCenterOffset[1], center[2] + topCenterOffset[2]];
    const y = topCenter[1] - (normal[0] * (x - topCenter[0]) + normal[2] * (z - topCenter[2])) / normal[1];
    const inverseQuaternion = geometry.inverseQuaternion!;
    const localPoint = rotateByQuaternion([x - center[0], y - center[1], z - center[2]], inverseQuaternion);
    return Math.abs(localPoint[0]) <= halfSize[0] + radius + 1e-6
        && Math.abs(localPoint[2]) <= halfSize[2] + radius + 1e-6 ? y : null;
}
export function uprightWall(wall: Surface) {
    return !wall.orientation || (preparedGeometry.get(wall)?.topNormal
        ?? rotateByQuaternion([0, 1, 0], wall.orientation.quaternion))[1] >= 1 - 1e-6;
}
// Only upright solid sides support wall movement.
export function wallAt(x: number, y: number, z: number, height: number, walls: Surface[], normal: [number, number] | null = null): [number, number] | null {
    for (const wall of walls) {
        if (!touchesHeight(y, height, wall)) continue;
        if (!uprightWall(wall)) continue;
        const frame = wallFrame(wall), [localX, localZ] = wallPoint(x, z, frame);
        const reach = PLAYER_RADIUS + 0.08;
        if (Math.abs(localZ) < frame.halfDepth + PLAYER_RADIUS && Math.abs(localX) >= frame.halfWidth && Math.abs(localX) - frame.halfWidth <= reach) {
            const sign = Math.sign(localX);
            const candidateNormal: [number, number] = [sign * frame.cosYaw, sign * frame.sinYaw];
            if (!normal || sameNormal(normal, candidateNormal)) return candidateNormal;
        }
        if (Math.abs(localX) < frame.halfWidth + PLAYER_RADIUS && Math.abs(localZ) >= frame.halfDepth && Math.abs(localZ) - frame.halfDepth <= reach) {
            const sign = Math.sign(localZ);
            const candidateNormal: [number, number] = [-sign * frame.sinYaw, sign * frame.cosYaw];
            if (!normal || sameNormal(normal, candidateNormal)) return candidateNormal;
        }
    }
    return null;
}
export function sameNormal(a: [number, number] | null, b: [number, number] | null) {
    return !!a && !!b && a[0] === b[0] && a[1] === b[1];
}

export function sweepWall(x: number, y: number, z: number, height: number, displacementX: number, displacementZ: number, walls: Surface[]) {
    let hit: { time: number; normal: [number, number]; wall: Surface } | null = null;
    for (const wall of walls) {
        if (!touchesHeight(y, height, wall)) continue;
        const frame = wallFrame(wall), localOrigin = wallPoint(x, z, frame);
        const localDisplacement = [displacementX * frame.cosYaw + displacementZ * frame.sinYaw, -displacementX * frame.sinYaw + displacementZ * frame.cosYaw];
        const expandedHalfSize = [frame.halfWidth + PLAYER_RADIUS, frame.halfDepth + PLAYER_RADIUS];
        let entryFraction = -Infinity, exitFraction = Infinity;
        let axis = 0, sign = 0;
        for (let i = 0; i < 2; i++) {
            if (Math.abs(localDisplacement[i]) < 1e-12) {
                if (Math.abs(localOrigin[i]) >= expandedHalfSize[i] - 1e-9) { exitFraction = -Infinity; break; }
                continue;
            }
            const negativeFaceFraction = (-expandedHalfSize[i] - localOrigin[i]) / localDisplacement[i];
            const positiveFaceFraction = (expandedHalfSize[i] - localOrigin[i]) / localDisplacement[i];
            const axisEntryFraction = Math.min(negativeFaceFraction, positiveFaceFraction);
            if (axisEntryFraction > entryFraction) { entryFraction = axisEntryFraction; axis = i; sign = -Math.sign(localDisplacement[i]); }
            exitFraction = Math.min(exitFraction, Math.max(negativeFaceFraction, positiveFaceFraction));
        }
        if (entryFraction < -1e-8 || entryFraction > 1 || entryFraction > exitFraction || exitFraction < 0 || !Number.isFinite(entryFraction)) continue;
        const time = Math.max(0, entryFraction);
        const normal: [number, number] = axis === 0 ? [sign * frame.cosYaw, sign * frame.sinYaw] : [-sign * frame.sinYaw, sign * frame.cosYaw];
        if (!hit || time < hit.time) hit = { time, normal, wall };
    }
    return hit;
}

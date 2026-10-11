import Box3D, { type b3Capsule, type b3CollisionPlane, type PlaneResultBuffer } from 'box3d.js/inline';

const b3 = await Box3D();
export type Position = [number, number, number];
export type SurfaceOrientation = { center: Position; halfSize: Position; quaternion: [number, number, number, number] };
export type Surface = {
    minX: number; maxX: number; minZ: number; maxZ: number; top: number; bottom?: number;
    orientation?: SurfaceOrientation;
};
/** Movement needs queries, not ownership of a particular physics engine. */
export type CollisionQueries = Pick<CollisionWorld, 'move' | 'wallAt' | 'canStand'>;
export const PLAYER_RADIUS = 0.3;
// Box3D's plane solver permits 5mm of penetration; keep that inside the collision skin.
const SKIN = 0.005;
const filter = b3.b3DefaultQueryFilter();
const acceptShape = () => true;
function capsule(height: number, margin = 0): b3Capsule {
    return { center1: [0, PLAYER_RADIUS, 0], center2: [0, height - PLAYER_RADIUS, 0], radius: PLAYER_RADIUS + SKIN + margin };
}
export function sameNormal(a: [number, number] | null, b: [number, number] | null) {
    return !!a && !!b && a[0] * b[0] + a[1] * b[1] > 0.9999;
}
export function resolveWallVelocity(vx: number, vz: number, [nx, nz]: [number, number], preserveSpeed: boolean): [number, number] {
    const speed = Math.hypot(vx, vz), inward = Math.min(0, vx * nx + vz * nz);
    vx -= nx * inward; vz -= nz * inward;
    const projected = Math.hypot(vx, vz);
    const scale = preserveSpeed && projected > 1e-6 ? speed / projected : 1;
    return [vx * scale, vz * scale];
}

/** Static collision world independent of player and replay state. Box3D owns broad phase, casts and contact solving. */
export class CollisionWorld {
    private world = b3.b3CreateWorld(b3.b3DefaultWorldDef());
    private planeResult = b3.createPlaneResult();
    constructor(surfaces: readonly Surface[]) {
        const shape = b3.b3DefaultShapeDef();
        for (const surface of surfaces) {
            const bottom = surface.bottom ?? -10000;
            const half: Position = surface.orientation?.halfSize ?? [
                (surface.maxX - surface.minX) / 2, (surface.top - bottom) / 2, (surface.maxZ - surface.minZ) / 2,
            ];
            const body = b3.b3DefaultBodyDef();
            body.position = surface.orientation?.center ?? [
                (surface.minX + surface.maxX) / 2, (surface.top + bottom) / 2, (surface.minZ + surface.maxZ) / 2,
            ];
            body.rotation = surface.orientation?.quaternion ?? [0, 0, 0, 1];
            b3.b3CreateBoxShape(b3.b3CreateBody(this.world, body), shape, ...half);
        }
    }
    dispose() { b3.b3DestroyWorld(this.world); }
    private contacts(position: Position, mover: b3Capsule): b3CollisionPlane[] {
        const planes: b3CollisionPlane[] = [];
        const result = this.planeResult;
        b3.b3World_CollideMover(this.world, position, mover, filter, (_shape: unknown, buffer: PlaneResultBuffer) => {
            for (let i = 0; i < buffer.count; i++) {
                b3.getPlaneResultAt(result, buffer, i);
                planes.push({ plane: { normal: [...result.plane.normal], offset: result.plane.offset },
                    pushLimit: 1e10, push: 1, clipVelocity: true });
            }
            return true;
        });
        return planes;
    }
    canStand(position: Position, height: number) {
        let clear = true;
        b3.b3World_CastShape(this.world, position, [0, 1 - PLAYER_RADIUS, 0], PLAYER_RADIUS,
            [0, height - 1, 0], filter, (_shape: unknown, _point: Position, _normal: Position, fraction: number) => {
                if (fraction < 1) clear = false;
                return fraction;
            });
        return clear;
    }
    wallAt(position: Position, height: number, preferred: [number, number] | null = null): [number, number] | null {
        let wall: [number, number] | null = null;
        // Wall probes only need a normal, not allocated solver planes for every contact.
        b3.b3World_CollideMover(this.world, position, capsule(height, 0.08), filter, (_shape: unknown, buffer: PlaneResultBuffer) => {
            for (let i = 0; i < buffer.count; i++) {
                const { plane: { normal: [nx, ny, nz] } } = b3.getPlaneResultAt(this.planeResult, buffer, i);
                if (Math.abs(ny) >= 1e-4) continue;
                if (!preferred || preferred[0] * nx + preferred[1] * nz > 0.9999) {
                    wall = [nx, nz];
                    return false;
                }
                if (!wall) wall = [nx, nz];
            }
            return true;
        });
        return wall;
    }
    /** Sweep the whole capsule along its 3D velocity, then solve the remaining motion at contact. */
    move(origin: Position, height: number, initialVelocity: Position, deltaTime: number,
        onWall: (normal: [number, number], velocity: Position) => Position) {
        let position: Position = [...origin], velocity: Position = [...initialVelocity];
        const mover = capsule(height);
        let remaining = deltaTime;
        for (let iteration = 0; iteration < 8; iteration++) {
            const planes = this.contacts(position, mover);
            for (const { plane } of planes) {
                const [nx, ny, nz] = plane.normal;
                if (Math.abs(ny) < 1e-4 && velocity[0] * nx + velocity[2] * nz < -1e-6) {
                    velocity = onWall([nx, nz], velocity);
                }
            }
            const desired = velocity.map(v => v * remaining) as Position;
            const delta = planes.length ? b3.b3SolvePlanes(desired, planes).delta : desired;
            const fraction = b3.b3World_CastMover(this.world, position, mover, delta, filter, acceptShape);
            position = position.map((v, i) => v + delta[i] * fraction) as Position;
            remaining *= 1 - fraction;
            if (remaining < 1e-8 || Math.hypot(...delta) < 1e-7) break;
        }
        mover.radius += 0.001;
        const contacts = this.contacts(position, mover);
        if (contacts.length) velocity = b3.b3ClipVector(velocity, contacts);
        const grounded = contacts.some(({ plane: { normal } }) => normal[1] > 0.65
            && initialVelocity.reduce((dot, v, i) => dot + v * normal[i], 0) <= 1e-5);
        return { position, velocity, grounded };
    }
}

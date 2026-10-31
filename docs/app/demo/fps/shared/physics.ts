import Box3D, { type b3Capsule, type b3CollisionPlane, type b3HullData, type b3MeshData, type b3ShapeId, type PlaneResultBuffer } from 'box3d.js/inline';
import type { WorldBox, WorldMeshCollider } from 'react-three-game/core';

type Vec = [number, number, number];
const b3 = await Box3D();
const solidFilter = { ...b3.b3DefaultQueryFilter(), maskBits: BigInt(1) };
const roomFilter = { ...b3.b3DefaultQueryFilter(), maskBits: BigInt(2) };
const accept = () => true;
const SKIN = 0.005;
const capsule = (height: number, radius = 0.36): b3Capsule => ({
  center1: [0, radius, 0], center2: [0, Math.max(radius, height - radius), 0], radius: radius + SKIN,
});

/** Immutable authored world, shared by local authority and presentation queries.
 * All collision detection, broad phase and mover constraint solving belong to Box3D.
 * Actor/projectile poses remain authority-owned numbers; replays never step this world. */
export class PhysicsWorld<T extends WorldBox = WorldBox> {
  private world = b3.b3CreateWorld(b3.b3DefaultWorldDef());
  private hulls: b3HullData[] = [];
  private meshes: b3MeshData[] = [];
  private solids = new Map<number, T>();
  private rooms = new Map<number, number>();
  private hitSpheres = new Map<number, b3ShapeId>();
  private planeResult = b3.createPlaneResult();
  private disposed = false;
  constructor(boxes: readonly T[], rooms: readonly WorldBox[] = []) {
    try {
      boxes.forEach(box => this.solids.set(this.addSolid(box, BigInt(1)).index1, box));
      rooms.forEach((room, index) => this.rooms.set(this.addHull(room, BigInt(2)).index1, index));
      // Fixed local-space hit volumes. They never participate in world queries.
      const body = b3.b3CreateBody(this.world, b3.b3DefaultBodyDef());
      const shape = b3.b3DefaultShapeDef(); shape.filter.categoryBits = BigInt(4);
      for (const radius of [0.42, 0.25]) this.hitSpheres.set(radius,
        b3.b3CreateSphereShape(body, shape, { center: [0, 0, 0], radius }));
      b3.b3World_RebuildStaticTree(this.world);
    } catch (error) { this.dispose(); throw error; }
  }
  private addSolid(box: WorldBox | WorldMeshCollider, categoryBits: bigint) {
    if (!('shape' in box) || box.shape === 'convex') return this.addHull(box, categoryBits);
    const mesh = b3.b3CreateMesh(new Float32Array(box.vertices.flat()), new Uint32Array(box.indices));
    if (!mesh) throw new Error('Box3D could not build the authored collision mesh');
    this.meshes.push(mesh);
    const body = b3.b3DefaultBodyDef(); body.position = box.p;
    const shape = b3.b3DefaultShapeDef(); shape.filter.categoryBits = categoryBits;
    return b3.b3CreateMeshShape(b3.b3CreateBody(this.world, body), shape, mesh, [1, 1, 1]);
  }
  private addHull(box: WorldBox, categoryBits: bigint) {
    const hull = b3.b3CreateHull(new Float32Array(box.vertices.flat()));
    if (!hull) throw new Error('Box3D could not build the authored collider hull');
    this.hulls.push(hull);
    const body = b3.b3DefaultBodyDef(); body.position = box.p;
    const shape = b3.b3DefaultShapeDef(); shape.filter.categoryBits = categoryBits;
    return b3.b3CreateHullShape(b3.b3CreateBody(this.world, body), shape, hull);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    b3.b3DestroyWorld(this.world);
    this.hulls.forEach(hull => b3.b3DestroyHull(hull));
    this.hulls.length = 0;
    this.meshes.forEach(mesh => b3.b3DestroyMesh(mesh));
    this.meshes.length = 0;
  }
  ray(origin: Vec, direction: Vec, max = 100, hit?: { block?: T; normal?: Vec }) {
    if (hit) { hit.block = undefined; hit.normal = undefined; }
    if (max <= 0) return max;
    const result = b3.b3World_CastRayClosest(this.world, origin, direction.map(v => v * max) as Vec, solidFilter);
    if (!result.hit) return max;
    if (hit) { hit.block = this.solids.get(result.shapeId.index1); hit.normal = [...result.normal]; }
    return result.fraction * max;
  }
  hitSphere(origin: Vec, direction: Vec, center: Vec, radius: number, max: number, hit?: { normal?: Vec }) {
    const result = b3.b3Shape_RayCast(this.hitSpheres.get(radius)!, origin.map((v, i) => v - center[i]) as Vec,
      direction.map(v => v * max) as Vec);
    if (hit && result.hit && result.fraction < 1) hit.normal = [...result.normal];
    return result.hit ? result.fraction * max : max;
  }
  roomAt(point: Vec) {
    let room = -1;
    b3.b3World_OverlapShape(this.world, point, [0, 0, 0], 0, roomFilter, (id: b3ShapeId) => {
      const index = this.rooms.get(id.index1);
      if (index !== undefined && (room < 0 || index < room)) room = index;
      return true;
    });
    return room;
  }
  blocked(origin: Vec, height = 1.8, radius = 0.36) {
    let blocked = false;
    // Keep resting floor contact outside the clearance probe.
    const points = [0, radius + 0.02, 0, 0, Math.max(radius + 0.02, height - radius), 0];
    b3.b3World_OverlapShape(this.world, origin, points, radius - 0.005, solidFilter, () => { blocked = true; return false; });
    return blocked;
  }
  walkable(origin: Vec, destination: Vec, height = 1.8) {
    if (this.blocked(origin, height, 0.4)) return false;
    const mover = capsule(height, 0.4);
    return b3.b3World_CastMover(this.world, origin, mover, destination.map((v, i) => v - origin[i]) as Vec, solidFilter, accept) >= 1;
  }
  private contacts(origin: Vec, mover: b3Capsule): b3CollisionPlane[] {
    const planes: b3CollisionPlane[] = [];
    b3.b3World_CollideMover(this.world, origin, mover, solidFilter, (_id: b3ShapeId, buffer: PlaneResultBuffer) => {
      for (let i = 0; i < buffer.count; i++) {
        const result = b3.getPlaneResultAt(this.planeResult, buffer, i);
        planes.push({ plane: { normal: [...result.plane.normal], offset: result.plane.offset }, pushLimit: 1e10, push: 1, clipVelocity: true });
      }
      return true;
    });
    return planes;
  }
  move(origin: Vec, height: number, velocity: Vec, dt: number) {
    let position: Vec = [...origin], remaining = dt;
    const mover = capsule(height);
    for (let i = 0; i < 8 && remaining > 1e-8; i++) {
      const planes = this.contacts(position, mover);
      const desired = velocity.map(v => v * remaining) as Vec;
      const delta = planes.length ? b3.b3SolvePlanes(desired, planes).delta : desired;
      const fraction = b3.b3World_CastMover(this.world, position, mover, delta, solidFilter, accept);
      position = position.map((v, axis) => v + delta[axis] * fraction) as Vec;
      remaining *= 1 - fraction;
      if (Math.hypot(...delta) < 1e-7) break;
    }
    mover.radius += 0.001;
    const contacts = this.contacts(position, mover);
    const grounded = contacts.some(({ plane: { normal } }) => normal[1] > 0.65
      && velocity.reduce((sum, v, i) => sum + v * normal[i], 0) <= 1e-5);
    return { position, velocity: contacts.length ? b3.b3ClipVector(velocity, contacts) : velocity, grounded };
  }
  /** Gameplay owns ballistic velocity and restitution; native sphere casts find impacts. */
  projectile(origin: Vec, velocity: Vec, dt: number) {
    const position: Vec = [...origin], next: Vec = [...velocity];
    let remaining = dt;
    for (let bounce = 0; bounce < 4 && remaining > 1e-6; bounce++) {
      const delta = next.map(v => v * remaining) as Vec;
      let fraction = 1, normal: Vec | null = null;
      b3.b3World_CastShape(this.world, position, [0, 0, 0], 0.09, delta, solidFilter,
        (_id: b3ShapeId, _point: Vec, n: Vec, t: number) => {
          if (t <= fraction) { fraction = t; normal = [...n]; }
          return t;
        });
      for (let i = 0; i < 3; i++) position[i] += delta[i] * fraction;
      if (!normal) break;
      const n: Vec = normal;
      const speed = next.reduce((sum, v, i) => sum + v * n[i], 0);
      for (let i = 0; i < 3; i++) { position[i] += n[i] * 0.0001; if (speed < 0) next[i] -= 1.45 * speed * n[i]; }
      if (n[1] > 0.65) { next[0] *= Math.exp(-dt * 5); next[2] *= Math.exp(-dt * 5); }
      remaining *= 1 - fraction;
    }
    return { position, velocity: next };
  }
}

"use client";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, NormalBlending, CanvasTexture, Color, DoubleSide, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Object3D, PlaneGeometry, PointLight, Quaternion, Vector3 } from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { attribute } from "three/tsl";
import { blocks } from "./shared/map";
import type { Shot } from "./shared/protocol";
import type { MatchSnapshot } from "./shared/protocol";
import type { ClientSession } from "./session";

export const MuzzleContext = createContext<Map<number, Group> | null>(null);
/** A cosmetic socket; authoritative hits still originate at the player's aim ray. */
export function MuzzleSocket({ actor }: { actor: number }) {
  const sockets = useContext(MuzzleContext)!, root = useRef<Group>(null);
  useEffect(() => {
    const socket = root.current!;
    sockets.set(actor, socket);
    return () => { if (sockets.get(actor) === socket) sockets.delete(actor); };
  }, [sockets, actor]);
  return <group ref={root} position={[0, 0.035, -0.61]} />;
}

function effectTexture(flame: boolean) {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(flame ? 0.16 : 0.3, "rgba(255,255,255,0.8)");
  gradient.addColorStop(0.65, "rgba(255,255,255,0.16)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  if (flame) {
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2;
      const radius = i % 2 ? 9 + (i % 5) : 24 + (i % 7);
      const x = 32 + Math.cos(angle) * radius, y = 32 + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
  } else ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

type Particle = {
  age: number; life: number; size: number; stretch: number; grow: number; alpha: number; gravity: number;
  position: Vector3; velocity: Vector3; rotation: Quaternion; color: Color; roll: number;
  mode: "billboard" | "streak" | "mark"; socket: Group | null;
  travel: number; traveled: number; fresh: boolean;
};
/** Fixed-capacity storage and shared geometry/material: one draw per effect family. */
class EffectPool {
  readonly mesh: InstancedMesh;
  readonly particles: Particle[];
  private cursor = 0;
  private transform = new Object3D();
  private alpha: InstancedBufferAttribute;
  private side = new Vector3();
  private along = new Vector3();
  private normal = new Vector3();
  constructor(count: number, additive: boolean, flame = false) {
    const geometry = new PlaneGeometry(1, 1);
    this.alpha = new InstancedBufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage);
    geometry.setAttribute("fxAlpha", this.alpha);
    const material = new MeshBasicNodeMaterial({ map: effectTexture(flame), transparent: true, depthWrite: false,
      side: DoubleSide, blending: additive ? AdditiveBlending : NormalBlending, toneMapped: false });
    material.opacityNode = attribute("fxAlpha", "float");
    this.mesh = new InstancedMesh(geometry, material, count);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false; // One bounded world-space batch spans the arena.
    this.mesh.renderOrder = additive ? 4 : 3;
    this.particles = Array.from({ length: count }, () => ({ age: 1, life: 0, size: 0, stretch: 1, grow: 0,
      alpha: 1, gravity: 0, position: new Vector3(), velocity: new Vector3(), rotation: new Quaternion(),
      color: new Color(), roll: 0, mode: "billboard", socket: null, travel: Infinity, traveled: 0, fresh: true }));
    this.transform.scale.setScalar(0); this.transform.updateMatrix();
    this.particles.forEach((_, i) => { this.mesh.setMatrixAt(i, this.transform.matrix); this.mesh.setColorAt(i, new Color()); });
  }
  emit(position: Vector3, life: number, size: number, color: string) {
    const p = this.particles[this.cursor++ % this.particles.length];
    p.position.copy(position); p.velocity.set(0, 0, 0); p.color.set(color); p.rotation.identity();
    p.age = 0; p.life = life; p.size = size; p.stretch = 1; p.grow = p.gravity = p.roll = 0;
    p.traveled = 0; p.fresh = true; p.alpha = 1; p.mode = "billboard"; p.socket = null; p.travel = Infinity;
    return p;
  }
  reset() { for (const p of this.particles) p.life = 0; }
  update(dt: number, camera: Object3D) {
    this.particles.forEach((p, i) => {
      if (p.age < p.life && p.travel > 0) {
        // Always show a newly observed flash for one frame, even after a hitch.
        p.age += p.fresh ? 0 : dt; p.fresh = false;
        const step = Math.min(dt, p.travel / Math.max(0.001, p.velocity.length()));
        p.position.addScaledVector(p.velocity, step);
        const moved = p.velocity.length() * step;
        p.travel -= moved; p.traveled += moved;
        p.velocity.y -= p.gravity * dt;
        if (p.socket) p.socket.getWorldPosition(p.position);
        this.transform.position.copy(p.position);
        const size = p.size + p.grow * p.age;
        this.transform.scale.set(size, size * p.stretch, 1);
        if (Number.isFinite(p.travel)) {
          // Position stores the tracer head; its tail stays behind that point.
          const length = Math.min(size * p.stretch, p.traveled);
          this.transform.scale.y = length;
          this.transform.position.addScaledVector(this.along.copy(p.velocity).normalize(), -length / 2);
        }
        if (p.mode === "mark") this.transform.quaternion.copy(p.rotation);
        else if (p.mode === "streak") {
          this.along.copy(p.velocity).normalize();
          this.normal.subVectors(camera.position, p.position).normalize();
          this.side.crossVectors(this.along, this.normal).normalize();
          if (this.side.lengthSq() < 0.001) this.side.set(1, 0, 0).applyQuaternion(camera.quaternion);
          this.normal.crossVectors(this.side, this.along).normalize();
          this.transform.matrix.makeBasis(this.side, this.along, this.normal);
          this.transform.quaternion.setFromRotationMatrix(this.transform.matrix);
        } else {
          this.transform.quaternion.copy(camera.quaternion);
          this.transform.rotateZ(p.roll);
        }
        this.alpha.setX(i, Math.max(0, 1 - p.age / p.life) * p.alpha);
      } else { this.transform.scale.setScalar(0); this.alpha.setX(i, 0); }
      this.transform.updateMatrix(); this.mesh.setMatrixAt(i, this.transform.matrix); this.mesh.setColorAt(i, p.color);
    });
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor!.needsUpdate = true; this.alpha.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); const m = this.mesh.material as MeshBasicNodeMaterial; m.map?.dispose(); m.dispose(); this.mesh.dispose(); }
}

/** Static collision surfaces supply a normal for flat impact marks and outward debris. */
export function impactNormal(shot: Shot, out: Vector3) {
  if (shot.impact === "ground") return out.set(0, 1, 0);
  if (shot.impact !== "body") {
    for (const b of blocks) {
      if (!shot.to.every((v, i) => Math.abs(v - b.p[i]) <= b.size[i] / 2 + 0.002)) continue;
      let axis = 0, error = Infinity;
      for (let i = 0; i < 3; i++) {
        const e = Math.abs(Math.abs(shot.to[i] - b.p[i]) - b.size[i] / 2);
        if (e < error) { error = e; axis = i; }
      }
      return out.set(0, 0, 0).setComponent(axis, shot.to[axis] >= b.p[axis] ? 1 : -1);
    }
  }
  return out.set(...shot.from).sub(new Vector3(...shot.to)).normalize();
}

export function CombatEffects({ match, playing, runtime }: { match: MatchSnapshot; playing: boolean; runtime: ClientSession }) {
  const sockets = useContext(MuzzleContext)!;
  const flash = useMemo(() => new EffectPool(32, true, true), []);
  const glow = useMemo(() => new EffectPool(160, true), []);
  const dust = useMemo(() => new EffectPool(128, false), []);
  const marks = useMemo(() => new EffectPool(64, false), []);
  const lights = useRef<[PointLight | null, PointLight | null]>([null, null]);
  const state = useMemo(() => ({ tick: -1, epoch: 0, shots: new Map<number, number>(), lightAge: [1, 1],
    origin: new Vector3(), direction: new Vector3(), hit: new Vector3(), normal: new Vector3(), z: new Vector3(0, 0, 1) }), [match]);
  useEffect(() => { [flash, glow, dust, marks].forEach(pool => pool.reset()); }, [state, flash, glow, dust, marks]);
  useEffect(() => () => { flash.dispose(); glow.dispose(); dust.dispose(); marks.dispose(); }, [flash, glow, dust, marks]);
  useFrame(({ camera }, dt) => {
    const elapsed = playing ? Math.min(dt, 0.1) : 0;
    if (state.epoch !== (runtime.viewEpoch ?? 0)) {
      state.epoch = runtime.viewEpoch ?? 0; state.shots.clear(); [flash, glow, dust, marks].forEach(p => p.reset());
      state.lightAge.fill(1);
      for (const s of match.shots) state.shots.set(s.shooter, s.tick);
      state.tick = -1;
    }
    if (match.tick < state.tick) { state.shots.clear(); [flash, glow, dust, marks].forEach(p => p.reset()); }
    state.tick = match.tick;
    for (const shot of match.shots) {
      if (shot.tick <= (state.shots.get(shot.shooter) ?? -1)) continue;
      state.shots.set(shot.shooter, shot.tick);
      if (!playing) continue;
      const socket = sockets.get(shot.shooter === (runtime.viewActorId ?? 0) ? -1 : shot.shooter);
      if (socket) { socket.updateWorldMatrix(true, false); socket.getWorldPosition(state.origin); }
      else state.origin.set(...shot.from);
      state.hit.set(...shot.to); state.direction.copy(state.hit).sub(state.origin).normalize();
      // Deterministic cosmetic variation does not consume authority RNG.
      let seed = shot.tick * 8191 + shot.shooter * 127;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const f = flash.emit(state.origin, 0.055, 0.23 + random() * 0.13, "#ffb34b");
      f.socket = socket ?? null; f.roll = random() * Math.PI * 2;
      const core = glow.emit(state.origin, 0.035, 0.09, "#fff3ce"); core.socket = socket ?? null;
      const plume = glow.emit(state.origin, 0.045, 0.065, "#ffc46d");
      plume.mode = "streak"; plume.velocity.copy(state.direction).multiplyScalar(2); plume.stretch = 5;
      const smoke = dust.emit(state.origin, 0.34, 0.065, "#9c9a91");
      smoke.alpha = 0.13; smoke.grow = 0.45; smoke.velocity.copy(state.direction).multiplyScalar(0.45); smoke.velocity.y += 0.25;
      const distance = state.origin.distanceTo(state.hit);
      if (distance > 1) {
        const streak = glow.emit(state.origin, Math.min(0.14, distance / 650 + 0.02), 0.014, "#ffe0a0");
        streak.mode = "streak"; streak.stretch = Math.min(2, distance * 0.3) / streak.size;
        streak.velocity.copy(state.direction).multiplyScalar(650); streak.travel = distance;
      }
      if (shot.impact && shot.impact !== "none") {
        impactNormal(shot, state.normal); state.hit.addScaledVector(state.normal, 0.018);
        const metal = shot.impact === "metal", body = shot.impact === "body";
        if (!body && shot.impact !== "ground") {
          const mark = marks.emit(state.hit, 9, 0.10 + random() * 0.05, "#24211d");
          mark.mode = "mark"; mark.rotation.setFromUnitVectors(state.z, state.normal); mark.alpha = 0.85;
        }
        for (let i = 0; i < (metal ? 6 : 3); i++) {
          const p = (metal ? glow : dust).emit(state.hit, metal ? 0.12 + random() * 0.16 : 0.25 + random() * 0.2,
            metal ? 0.014 : 0.06, metal ? "#ffd58a" : body ? "#704e43" : "#b1a48c");
          p.velocity.set(random() - 0.5, random() - 0.5, random() - 0.5).addScaledVector(state.normal, 1.2).multiplyScalar(metal ? 3 : 0.7);
          p.gravity = metal ? 6 : 0.5; p.alpha = metal ? 1 : 0.35;
          if (metal) { p.mode = "streak"; p.stretch = 6; } else p.grow = 0.5;
        }
      }
      const index = shot.shooter === (runtime.viewActorId ?? 0) ? 0 : 1;
      const light = lights.current[index];
      if (light && state.origin.distanceToSquared(camera.position) < 400) {
        light.position.copy(state.origin); state.lightAge[index] = 0;
      }
    }
    [flash, glow, dust, marks].forEach(pool => pool.update(elapsed, camera));
    lights.current.forEach((light, i) => {
      state.lightAge[i] += elapsed;
      if (light) light.intensity = playing ? Math.max(0, 1 - state.lightAge[i] / 0.055) * 5 : 0;
    });
  }, -0.2);
  return <group>
    <primitive object={flash.mesh} /><primitive object={glow.mesh} /><primitive object={dust.mesh} /><primitive object={marks.mesh} />
    <pointLight ref={v => { lights.current[0] = v; }} color="#ffc88a" intensity={0} distance={4} decay={2} />
    <pointLight ref={v => { lights.current[1] = v; }} color="#ffc88a" intensity={0} distance={4} decay={2} />
  </group>;
}

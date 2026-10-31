"use client";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { withBasePath } from "../../../basePath";
import { AdditiveBlending, NormalBlending, CanvasTexture, Color, DoubleSide, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Object3D, PlaneGeometry, PointLight, Quaternion, Vector3 } from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { attribute, uv, vec3, float, mix, smoothstep, mx_noise_float } from "three/tsl";
import { STEP, type Shot } from "../shared/protocol";
import type { MatchSnapshot } from "../shared/protocol";
import type { ClientSession } from "../session";

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
  private phase: InstancedBufferAttribute;
  private side = new Vector3();
  private along = new Vector3();
  private normal = new Vector3();
  constructor(count: number, additive: boolean, flame = false, procedural?: "fire" | "smoke") {
    const geometry = new PlaneGeometry(1, 1);
    this.alpha = new InstancedBufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage);
    geometry.setAttribute("fxAlpha", this.alpha);
    this.phase = new InstancedBufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage);
    geometry.setAttribute("fxPhase", this.phase);
    geometry.setAttribute("fxSeed", new InstancedBufferAttribute(Float32Array.from({ length: count }, (_, i) => i * 1.618), 1));
    const material = new MeshBasicNodeMaterial({ map: procedural ? null : effectTexture(flame), transparent: true, depthWrite: false,
      side: DoubleSide, blending: additive ? AdditiveBlending : NormalBlending, toneMapped: false });
    material.opacityNode = attribute("fxAlpha", "float");
    if (procedural) {
      const phase = float(attribute<"float">("fxPhase", "float")), seed = float(attribute<"float">("fxSeed", "float"));
      const p = uv().sub(0.5).mul(2);
      const noise = mx_noise_float(vec3(p.mul(3.2), phase.mul(-2).add(seed))).mul(0.65)
        .add(mx_noise_float(vec3(p.mul(7), phase.mul(-3).add(seed))).mul(0.25));
      const density = float(1).sub(p.length()).add(noise.mul(0.32));
      const edge = smoothstep(0.02, 0.32, density);
      material.opacityNode = edge.mul(attribute("fxAlpha", "float"));
      if (procedural === "fire") {
        const heat = density.mul(1.25).sub(phase.mul(0.6)).clamp(0, 1);
        material.colorNode = mix(mix(vec3(0.7, 0.055, 0.005), vec3(3.8, 0.85, 0.08), smoothstep(0, 0.6, heat)),
          vec3(6, 4.3, 1.8), smoothstep(0.65, 1, heat));
      } else {
        // Soft lit-looking density without textures or per-particle lights.
        const shade = noise.mul(0.25).add(p.y.mul(0.08)).add(0.3).clamp(0.12, 0.55);
        material.colorNode = vec3(shade.mul(0.9), shade.mul(0.85), shade.mul(0.78));
      }
    }
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
      this.phase.setX(i, p.life > 0 ? p.age / p.life : 1);
      this.transform.updateMatrix(); this.mesh.setMatrixAt(i, this.transform.matrix); this.mesh.setColorAt(i, p.color);
    });
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor!.needsUpdate = true; this.alpha.needsUpdate = true; this.phase.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); const m = this.mesh.material as MeshBasicNodeMaterial; m.map?.dispose(); m.dispose(); this.mesh.dispose(); }
}

/** Replay the authority's impact orientation instead of querying current geometry. */
export function impactNormal(shot: Shot, out: Vector3) {
  if (shot.normal) return out.set(...shot.normal);
  return out.set(shot.from[0] - shot.to[0], shot.from[1] - shot.to[1], shot.from[2] - shot.to[2]).normalize();
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


/** Blender-authored asset shared by the held grenade and authority-driven projectile. */
export function GrenadeModel() {
  const { scene } = useGLTF(withBasePath("/models/fps/relay-grenade.glb"));
  const object = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={object} dispose={null} />;
}

/** Bounded cosmetic pools driven by saved explosion events, independent of damage and physics. */
export function GrenadeEffects({ match, playing, runtime }: { match: MatchSnapshot; playing: boolean; runtime: ClientSession }) {
  const grenades = useRef<Group>(null), lights = useRef<(PointLight | null)[]>([]);
  const fire = useMemo(() => new EffectPool(64, true, false, "fire"), []);
  const smoke = useMemo(() => new EffectPool(96, false, false, "smoke"), []);
  const sparks = useMemo(() => new EffectPool(128, true), []);
  const debris = useMemo(() => new EffectPool(96, false), []);
  const state = useMemo(() => ({ ids: new Set<number>(), tick: -1, epoch: runtime.viewEpoch ?? 0,
    origin: new Vector3(), lightAge: [1, 1], lightIndex: 0 }), [runtime]);
  useEffect(() => () => { fire.dispose(); smoke.dispose(); sparks.dispose(); debris.dispose(); }, [fire, smoke, sparks, debris]);
  useFrame(({ camera }, dt) => {
    const elapsed = playing ? Math.min(dt, 0.1) : 0;
    if (state.epoch !== (runtime.viewEpoch ?? 0) || match.tick < state.tick) {
      state.epoch = runtime.viewEpoch ?? 0; state.ids.clear(); state.lightAge.fill(1);
      [fire, smoke, sparks, debris].forEach(pool => pool.reset());
    }
    state.tick = match.tick;
    grenades.current?.children.forEach((object, i) => {
      const g = match.grenades[i]; object.visible = !!g;
      if (!g) return;
      object.position.set(g.x, g.y, g.z);
      const spin = match.tick * STEP;
      if (Math.hypot(g.vx, g.vy, g.vz) > 0.5) object.rotation.set(spin * 5 + g.id, spin * 3, spin * 2);
    });
    for (const event of match.explosions) {
      if (state.ids.has(event.id)) continue;
      state.ids.add(event.id);
      if (!playing) continue;
      state.origin.set(event.x, event.y, event.z);
      let seed = event.id * 8191 + 17;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const core = fire.emit(state.origin, 0.13, 0.8, "#ffffff"); core.grow = 12;
      for (let i = 0; i < 7; i++) {
        const angle = random() * Math.PI * 2, speed = 1.5 + random() * 2;
        const flame = fire.emit(state.origin, 0.25 + random() * 0.2, 0.55, "#ffffff");
        flame.velocity.set(Math.cos(angle) * speed, 1 + random() * 2, Math.sin(angle) * speed);
        flame.grow = 3; flame.roll = random() * Math.PI * 2;
        const puff = smoke.emit(state.origin, 1.4 + random() * 0.8, 0.5 + random() * 0.4, "#ffffff");
        puff.position.y += 0.2; puff.velocity.copy(flame.velocity).multiplyScalar(0.35); puff.velocity.y += 0.4;
        puff.grow = 1.3; puff.alpha = 0.5; puff.roll = random() * Math.PI * 2;
      }
      for (let i = 0; i < 22; i++) {
        const ember = i < 12;
        const p = (ember ? sparks : debris).emit(state.origin, 0.35 + random() * 0.65,
          ember ? 0.018 : 0.035 + random() * 0.045, ember ? "#ffbc58" : "#544b3c");
        const angle = random() * Math.PI * 2, speed = 2 + random() * 6;
        p.velocity.set(Math.cos(angle) * speed, 1 + random() * 7, Math.sin(angle) * speed);
        p.gravity = 10; p.mode = "streak"; p.stretch = ember ? 7 : 2; p.alpha = ember ? 1 : 0.9;
      }
      const index = state.lightIndex++ % 2, light = lights.current[index];
      if (light && camera.position.distanceToSquared(state.origin) < 900) { light.position.copy(state.origin); state.lightAge[index] = 0; }
    }
    for (const id of state.ids) if (!match.explosions.some(e => e.id === id)) state.ids.delete(id);
    [fire, smoke, sparks, debris].forEach(pool => pool.update(elapsed, camera));
    lights.current.forEach((light, i) => { state.lightAge[i] += elapsed;
      if (light) light.intensity = Math.max(0, 1 - state.lightAge[i] / 0.16) ** 2 * 45; });
  }, -0.2);
  return <group>
    <group ref={grenades}>{Array.from({ length: 16 }, (_, i) => <group key={i} visible={false}><GrenadeModel /></group>)}</group>
    {[fire, smoke, sparks, debris].map((pool, i) => <primitive key={i} object={pool.mesh} dispose={null} />)}
    {[0, 1].map(i => <pointLight key={i} ref={light => { lights.current[i] = light; }} color="#ffb05b" intensity={0} distance={10} decay={2} />)}
  </group>;
}

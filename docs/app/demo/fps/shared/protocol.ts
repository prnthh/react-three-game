/** Shared commands, snapshot data and presentation math. No server runtime imports. */
import type { Vec } from "./map";

export const LIMIT = 40,
  DURATION = 300,
  STEP = 1 / 60;
export const HEALTH_RULES = {
  max: 100, respawnDelay: 3, spawnShield: 1.5, regenDelay: 5, regenPerSecond: 25,
};
export const THROW_DURATION = 2.2, THROW_RELEASE = 0.8;
export const STANCE_TIMING = { crouch: 0.16, stand: 0.14, aimIn: 0.16, aimOut: 0.12 };
export const crouchOffset = (a: { crouching: boolean; crouchAmount?: number }) =>
  0.55 * (a.crouchAmount ?? (a.crouching ? 1 : 0));
export const eyeHeight = (a: { crouching: boolean; crouchAmount?: number }) => 1.5 - crouchOffset(a);
export const aimPitch = (input: number, recoil: number) => Math.max(-1.4, Math.min(1.4, input + recoil));
/** Shared timing data; no renderer dependency. Contact events are saved with authority state. */
export const GAITS = {
  idle: { duration: 8.333333015441895, speed: 1, contacts: [] as number[] },
  walk: { duration: 1.0333333015441895, speed: 4.6, contacts: [0.33, 0.83] },
  run: { duration: 0.6333333253860474, speed: 7, contacts: [0.32, 0.82] },
};
export type GaitState = { state: keyof typeof GAITS; phase: number; steps: number };
export function advanceGait(gait: GaitState, speed: number, dt: number) {
  const state = speed < 0.12 ? "idle" : speed > (gait.state === "run" ? 4.9 : 5.2) ? "run" : "walk";
  if (state !== gait.state && (state === "idle" || gait.state === "idle")) gait.phase = 0;
  gait.state = state;
  const definition = GAITS[state];
  const rate = state === "idle" ? 1 : Math.max(0.35, Math.min(1.6, speed / definition.speed));
  const start = gait.phase, end = start + Math.max(0, Math.min(dt, 0.1)) * rate / definition.duration;
  for (const marker of definition.contacts) gait.steps += Math.floor(end - marker) - Math.floor(start - marker);
  gait.phase = end % 1;
}
export type ClientActor = {
  gait: GaitState;
  lastKiller: number;
  recoilPitch: number;
  pitch: number;
  crouching: boolean;
  crouchAmount: number;
  aimAmount: number;
  aiming: boolean;
  grenades: number;
  throwing: number;
  id: number;
  name: string;
  team: 0 | 1;
  x: number;
  z: number;
  y: number;
  vy: number;
  grounded: boolean;
  yaw: number;
  hp: number;
  ammo: number;
  reload: number;
  cooldown: number;
  respawn: number;
  kills: number;
  deaths: number;
  shield: number;
  moving: boolean;
  speed: number;
};
export type Command = {
  crouch: boolean;
  grenade: boolean;
  forward: number;
  right: number;
  yaw: number;
  pitch: number;
  fire: boolean;
  reload: boolean;
  sprint: boolean;
  jump: boolean;
  aim: boolean;
};
export const idleCommand = (): Command => ({
  crouch: false, grenade: false,
  forward: 0,
  right: 0,
  yaw: 0,
  pitch: 0,
  fire: false,
  reload: false,
  sprint: false,
  jump: false,
  aim: false,
});
export type ImpactMaterial = "none" | "metal" | "concrete" | "ground" | "body";
export type Shot = {
  /** Authority collision normal, retained for replay impact effects. */
  normal?: Vec;
  impact: ImpactMaterial;
  victim: number;
  from: Vec;
  to: Vec;
  team: number;
  age: number;
  hit: boolean;
  shooter: number;
  tick: number;
};
export type Grenade = { id: number; owner: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; fuse: number };
export type Explosion = { id: number; x: number; y: number; z: number; age: number };

const actorNumbers = ["crouchAmount", "aimAmount", "id", "x", "y", "z", "vy", "yaw", "pitch", "hp", "ammo", "reload", "cooldown", "respawn", "kills", "deaths", "shield", "speed", "grenades", "throwing", "recoilPitch", "lastKiller"] as const;
export type MatchSnapshot = {
  version: 4;
  tick: number;
  acknowledged: number;
  time: number;
  winner: number | null;
  actors: ClientActor[];
  scores: [number, number];
  shots: Shot[];
  grenades: Grenade[];
  explosions: Explosion[];
  feed: string[];
};
export const emptySnapshot = (): MatchSnapshot => ({
  version: 4, tick: -1, acknowledged: -1, time: 0, winner: null,
  actors: [], scores: [0, 0], shots: [], grenades: [], explosions: [], feed: [],
});

/** Copies into owned buffers: neither client nor serialized packets can mutate authority. */
export function copySnapshot(source: Omit<MatchSnapshot, "version" | "acknowledged">, target: MatchSnapshot, acknowledged = -1) {
  target.version = 4;
  target.tick = source.tick;
  target.acknowledged = acknowledged;
  target.time = source.time;
  target.winner = source.winner;
  target.scores[0] = source.scores[0]; target.scores[1] = source.scores[1];
  source.actors.forEach((actor, i) => {
    const out = target.actors[i] ??= {} as ClientActor;
    for (const key of actorNumbers) out[key] = actor[key];
    out.gait ??= { state: "idle", phase: 0, steps: 0 };
    out.gait.state = actor.gait.state; out.gait.phase = actor.gait.phase; out.gait.steps = actor.gait.steps;
    out.name = actor.name; out.team = actor.team; out.moving = actor.moving; out.grounded = actor.grounded; out.crouching = actor.crouching; out.aiming = actor.aiming;
  });
  target.actors.length = source.actors.length;
  source.shots.forEach((shot, i) => {
    const out = target.shots[i] ??= { from: [0, 0, 0], to: [0, 0, 0] } as Shot;
    for (let axis = 0; axis < 3; axis++) {
      out.from[axis] = shot.from[axis]; out.to[axis] = shot.to[axis];
    }
    if (shot.normal) {
      out.normal ??= [0, 0, 0];
      for (let axis = 0; axis < 3; axis++) out.normal[axis] = shot.normal[axis];
    } else out.normal = undefined;
    out.team = shot.team; out.age = shot.age; out.hit = shot.hit;
    out.shooter = shot.shooter; out.tick = shot.tick;
    out.impact = shot.impact; out.victim = shot.victim;
  });
  target.shots.length = source.shots.length;
  source.grenades.forEach((g, i) => {
    const out = target.grenades[i] ??= {} as Grenade;
    out.id = g.id; out.owner = g.owner;
    out.x = g.x; out.y = g.y; out.z = g.z;
    out.vx = g.vx; out.vy = g.vy; out.vz = g.vz; out.fuse = g.fuse;
  });
  target.grenades.length = source.grenades.length;
  source.explosions.forEach((e, i) => {
    const out = target.explosions[i] ??= {} as Explosion;
    out.id = e.id; out.x = e.x; out.y = e.y; out.z = e.z; out.age = e.age;
  });
  target.explosions.length = source.explosions.length;
  target.feed.length = source.feed.length;
  for (let i = 0; i < source.feed.length; i++) target.feed[i] = source.feed[i];
  return target;
}

export type CommandPacket = { sequence: number; command: Command };

/** Single-player loopback: one input packet advances one server tick and returns a copy. */
export interface LocalMatchConnection {
  readSnapshot(target: MatchSnapshot): void;
  exchange(packet: CommandPacket, target: MatchSnapshot): void;
}

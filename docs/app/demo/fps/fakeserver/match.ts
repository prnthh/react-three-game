/** Pure fixed-step match rules. No browser, React or Three dependency: future server authority lives here. */
import { wallDistance, physics, blocks, spawnPoints, type SpawnPoint, type Vec, type Block } from "../shared/world";
export { wallDistance, blocks, type Vec, type Block } from "../shared/world";
import { LIMIT, DURATION, STEP, HEALTH_RULES, THROW_DURATION, THROW_RELEASE, STANCE_TIMING,
  crouchOffset, eyeHeight, aimPitch, advanceGait,
  type ClientActor, type Command, type Shot, type Grenade, type Explosion, type ImpactMaterial } from "../shared/protocol";
export { LIMIT, DURATION, STEP, HEALTH_RULES, THROW_DURATION, THROW_RELEASE, STANCE_TIMING,
  crouchOffset, eyeHeight, aimPitch, advanceGait, idleCommand, GAITS } from "../shared/protocol";
export type { Command, Shot, Grenade, Explosion, ImpactMaterial } from "../shared/protocol";
export type Actor = ClientActor & { lastDamageTick: number; throwYaw: number; throwPitch: number };
function approachStance(amount: number, active: boolean, dt: number, enter: number, exit: number) {
  return active ? Math.min(1, amount + dt / enter) : Math.max(0, amount - dt / exit);
}
export type Match = {
  spawnPoints: SpawnPoint[];
  grenades: Grenade[];
  explosions: Explosion[];
  nextGrenade: number;
  actors: Actor[];
  scores: [number, number];
  time: number;
  tick: number;
  shots: Shot[];
  feed: string[];
  winner: number | null;
  seed: number;
};
function random(m: Match) {
  m.seed = (Math.imul(m.seed, 1664525) + 1013904223) >>> 0;
  return m.seed / 4294967296;
}
function spawn(a: Actor, m: Match) {
  const points = m.spawnPoints.filter(point => point.team === a.team);
  const slot = m.actors.filter(actor => actor.team === a.team && actor.id < a.id).length;
  const point = points[slot % points.length];
  [a.x, a.y, a.z] = point.position;
  a.vy = 0; a.grounded = physics.move([a.x, a.y, a.z], 1.8, [0, 0, 0], 0).grounded;
  a.yaw = point.yaw;
  a.pitch = 0;
  a.gait.state = "idle"; a.gait.phase = 0; a.gait.steps = 0;
  a.hp = HEALTH_RULES.max;
  a.lastDamageTick = m.tick;
  a.ammo = 30;
  a.reload = 0;
  a.cooldown = 0;
  a.recoilPitch = 0;
  a.respawn = 0;
  a.shield = HEALTH_RULES.spawnShield;
  a.speed = 0;
  a.moving = false;
  a.crouching = a.aiming = false;
  a.crouchAmount = a.aimAmount = 0;
  a.grenades = 2; a.throwing = 0; a.throwYaw = a.throwPitch = 0;
}
export function createMatch(seed = 317, points: readonly SpawnPoint[] = spawnPoints): Match {
  for (const team of [0, 1]) {
    if (!points.some(point => point.team === team)) throw new Error(`Map needs an enabled spawn point for team ${team}`);
  }
  const m: Match = {
    spawnPoints: structuredClone([...points]),
    actors: [], grenades: [], explosions: [], nextGrenade: 0,
    scores: [0, 0],
    time: DURATION,
    tick: 0,
    shots: [],
    feed: [],
    winner: null,
    seed,
  };
  const names = [
    "YOU",
    "KITE",
    "MICA",
    "PATCH",
    "ONYX",
    "ECHO",
    "WISP",
    "NOVA",
  ];
  for (let id = 0; id < 8; id++) {
    const a: Actor = {
      gait: { state: "idle", phase: 0, steps: 0 },
      x: 0, z: 0, y: 0, vy: 0, yaw: 0, pitch: 0, hp: HEALTH_RULES.max, ammo: 30,
      reload: 0, cooldown: 0, respawn: 0, shield: 0,
      crouching: false, crouchAmount: 0, aimAmount: 0, aiming: false, grenades: 2, throwing: 0, throwYaw: 0, throwPitch: 0,
      lastDamageTick: 0, lastKiller: -1, recoilPitch: 0, speed: 0,
      id,
      name: names[id],
      team: id < 4 ? 0 : 1,
      kills: 0,
      deaths: 0,
      moving: false,
      grounded: true,
    };
    spawn(a, m);
    m.actors.push(a);
  }
  return m;
}
export function blocked(x: number, z: number, r = 0.36, y = 0) {
  return physics.blocked([x, y, z], 1.8, r);
}
export function fire(
  m: Match,
  a: Actor,
  yaw: number,
  pitch: number,
  spread = 0,
) {
  if (
    a.hp <= 0 ||
    a.reload > 0 ||
    a.throwing > 0 ||
    a.cooldown > 0 ||
    a.ammo <= 0 ||
    m.winner !== null
  )
    return;
  a.ammo--;
  a.cooldown = 0.12;
  a.shield = 0;
  // Raw look input cannot overwrite authoritative weapon kick. Apply the current
  // offset to this shot, then accumulate kick for subsequent shots and the view.
  pitch = aimPitch(pitch, a.recoilPitch);
  a.recoilPitch = Math.min(0.1, a.recoilPitch + 0.009);
  yaw += (random(m) - 0.5) * spread;
  pitch += (random(m) - 0.5) * spread;
  const dir: Vec = [
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    ],
    from: Vec = [a.x, a.y + eyeHeight(a), a.z];
  const surface: { block?: Block; normal?: Vec } = {};
  let distance = wallDistance(from, dir, 100, surface),
    victim: Actor | undefined,
    head = false;
  let impact: ImpactMaterial = surface.block ? (surface.block.kind === "crate" || surface.block.kind === "roof" ? "metal" : surface.block.kind === "ground" ? "ground" : "concrete") : "none";
  for (const b of m.actors) {
    if (b === a || b.hp <= 0) continue;
    for (const [height, radius, isHead] of [
      [1.1, 0.42, false],
      [1.65, 0.25, true],
    ] as const) {
      const near = physics.hitSphere(from, dir, [b.x, b.y + height - crouchOffset(b), b.z], radius, distance, surface);
      if (near > 0 && near < distance) { distance = near; victim = b; head = isHead; }
    }
  }
  const hit = !!victim && applyDamage(m, a, victim, head ? 70 : 34) > 0;

  m.shots.push({
    impact: victim ? "body" : impact,
    victim: victim?.id ?? -1,
    normal: surface.normal,
    from,
    to: from.map((v, i) => v + dir[i] * distance) as Vec,
    team: a.team,
    age: 0,
    hit,
    shooter: a.id,
    tick: m.tick,
  });
}
/** Shared damage/scoring path for hitscan and authoritative explosions. */
export function applyDamage(m: Match, source: Actor, victim: Actor, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0 || victim.hp <= 0 || victim.shield > 0
      || (source !== victim && source.team === victim.team)) return 0;
  const applied = Math.min(victim.hp, amount);
  victim.hp -= applied;
  victim.lastDamageTick = m.tick;
  if (victim.hp === 0) killActor(m, source, victim);
  return applied;
}

function killActor(m: Match, source: Actor, victim: Actor) {
  victim.lastKiller = source.id;
  victim.deaths++; victim.respawn = HEALTH_RULES.respawnDelay; victim.throwing = 0; victim.speed = 0;
  if (source !== victim) { source.kills++; m.scores[source.team]++; }
  m.feed.unshift(`${source.name}  ›  ${victim.name}`);
  m.feed.length = Math.min(m.feed.length, 5);
  if (m.scores[source.team] >= LIMIT) m.winner = source.team;
}

function advanceGrenades(m: Match, dt: number) {
  ageEvents(m.explosions, dt, 0.4);
  let count = 0;
  for (const g of m.grenades) {
    g.fuse -= dt;
    g.vy -= 12 * dt;
    const motion = physics.projectile([g.x, g.y, g.z], [g.vx, g.vy, g.vz], dt);
    [g.x, g.y, g.z] = motion.position;
    [g.vx, g.vy, g.vz] = motion.velocity;
    if (g.fuse > 0) { m.grenades[count++] = g; continue; }
    m.explosions.push({ id: g.id, x: g.x, y: g.y, z: g.z, age: 0 });
    const owner = m.actors.find(a => a.id === g.owner)!;
    for (const victim of m.actors) {
      const dx = victim.x - g.x, dy = victim.y + eyeHeight(victim) * 0.6 - g.y, dz = victim.z - g.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 6 && (d < 0.001 || wallDistance([g.x, g.y, g.z], [dx / d, dy / d, dz / d], d) >= d - 0.01))
        applyDamage(m, owner, victim, Math.ceil(140 * (1 - d / 6)));
    }
  }
  m.grenades.length = count;
}

/** Controllers provide intent only. The same rules execute every actor's command. */
type ReadonlyState<T> = { readonly [Key in keyof T]: ReadonlyState<T[Key]> };
export type ControllerMatch = ReadonlyState<Match>;
export type ControllerActor = ReadonlyState<Actor>;
export interface ActorController {
  command(match: ControllerMatch, actor: ControllerActor, dt: number): Command;
}
/** Timers run before input, and a respawn consumes this actor's tick. */
function advanceActorTimers(m: Match, a: Actor, dt: number): boolean {
  a.cooldown = Math.max(0, a.cooldown - dt);
  a.recoilPitch *= Math.exp(-3.5 * dt);
  a.shield = Math.max(0, a.shield - dt);
  if (a.hp <= 0) {
    a.respawn -= dt;
    if (a.respawn <= 0) spawn(a, m);
    return false;
  }
  if (a.reload > 0) {
    a.reload -= dt;
    if (a.reload <= 0) {
      a.reload = 0;
      a.ammo = 30;
    }
  }
  return true;
}

/** Handle reload/throw intent before movement so stance and speed see the resolved state. */
function updateActorWeapons(m: Match, a: Actor, command: Command, dt: number) {
  if (command.grenade && a.grenades > 0 && a.throwing === 0 && a.reload === 0) {
    a.grenades--; a.throwing = THROW_DURATION; a.shield = 0;
    a.throwYaw = command.yaw; a.throwPitch = aimPitch(command.pitch, a.recoilPitch);
  }
  if (a.throwing > 0) {
    const before = a.throwing;
    a.throwing = Math.max(0, before - dt);
    if (before > THROW_DURATION - THROW_RELEASE && a.throwing <= THROW_DURATION - THROW_RELEASE) {
      const horizontal = Math.cos(a.throwPitch) * 12;
      m.grenades.push({ id: m.nextGrenade++, owner: a.id, x: a.x, y: a.y + eyeHeight(a), z: a.z,
        vx: -Math.sin(a.throwYaw) * horizontal, vz: -Math.cos(a.throwYaw) * horizontal,
        vy: Math.sin(a.throwPitch) * 12 + 3, fuse: 2.5 });
    }
  }
  if (command.reload && a.throwing === 0 && a.ammo < 30 && a.reload === 0) a.reload = 1.7;
}

function updateCrouch(a: Actor, command: Command, dt: number) {
  const blockedStanding = a.crouchAmount > 0 && physics.blocked([a.x, a.y, a.z], 1.8);
  a.crouching = command.crouch || blockedStanding;
  a.crouchAmount = approachStance(a.crouchAmount, a.crouching, dt, STANCE_TIMING.crouch, STANCE_TIMING.stand);
}

function updateAim(a: Actor, command: Command, dt: number) {
  const weaponBusy = a.throwing > 0 || a.reload > 0;
  a.aiming = command.aim && !weaponBusy;
  a.aimAmount = approachStance(a.aimAmount, a.aiming, dt, STANCE_TIMING.aimIn, STANCE_TIMING.aimOut);
}

function fullyStanding(a: Actor) {
  return !a.crouching && a.crouchAmount === 0;
}

/** One set of movement restrictions for human inputs, bot commands and future prediction. */
function movementSpeed(a: Actor, command: Command) {
  const canSprint = command.forward > 0.5 && command.forward >= Math.abs(command.right)
    && fullyStanding(a) && a.aimAmount === 0 && !command.aim && !command.fire
    && a.reload === 0 && a.throwing === 0;
  if (command.sprint && canSprint) return 7;
  // Speed follows stance progress instead of snapping on the first input tick.
  return Math.min(4.6 + (1.8 - 4.6) * a.crouchAmount,
    4.6 + (2.7 - 4.6) * a.aimAmount, a.throwing > 0 ? 2.7 : 4.6);
}

function moveActor(a: Actor, command: Command, dt: number) {
  const speed = movementSpeed(a, command);
  const norm = Math.max(1, Math.hypot(command.forward, command.right));
  const sin = Math.sin(command.yaw), cos = Math.cos(command.yaw);
  const vx = ((-sin * command.forward + cos * command.right) * speed) / norm;
  const vz = ((-cos * command.forward - sin * command.right) * speed) / norm;
  const beforeX = a.x, beforeZ = a.z;
  if (command.jump && fullyStanding(a) && a.grounded) a.vy = 4;
  a.vy -= 12 * dt;
  const motion = physics.move([a.x, a.y, a.z], 1.8 - crouchOffset(a), [vx, a.vy, vz], dt);
  [a.x, a.y, a.z] = motion.position;
  a.vy = motion.velocity[1]; a.grounded = motion.grounded;
  a.speed = Math.hypot(a.x - beforeX, a.z - beforeZ) / dt;
  a.moving = a.speed > 0.12;
}

function stepActor(m: Match, a: Actor, inputs: ReadonlyMap<number, Command>, dt: number) {
  if (!advanceActorTimers(m, a, dt)) return;
  const command = inputs.get(a.id);
  if (!command) throw new Error(`Missing command for actor ${a.id}`);
  a.yaw = command.yaw;
  a.pitch = command.pitch;
  updateCrouch(a, command, dt);
  updateActorWeapons(m, a, command, dt);
  updateAim(a, command, dt);
  moveActor(a, command, dt);
  if (command.fire) fire(m, a, command.yaw, command.pitch, 0.025 + (0.008 - 0.025) * a.aimAmount);
}

/** Compact transient events in place; presentation may retain their collection references. */
function ageEvents<T extends { age: number }>(events: T[], dt: number, lifetime: number) {
  let count = 0;
  for (const event of events) {
    event.age += dt;
    if (event.age < lifetime) events[count++] = event;
  }
  events.length = count;
}

/** Runs after every damage source; recovery never executes on replay snapshots. */
function recoverHealth(m: Match, dt: number) {
  for (const actor of m.actors) {
    if (actor.hp <= 0 || actor.hp >= HEALTH_RULES.max) continue;
    if ((m.tick - actor.lastDamageTick) * STEP <= HEALTH_RULES.regenDelay) continue;
    actor.hp = Math.min(HEALTH_RULES.max, actor.hp + HEALTH_RULES.regenPerSecond * dt);
  }
}

/** Tick order is gameplay behavior: actors resolve in slot order, then gait and grenades. */
export function stepMatch(m: Match, inputs: ReadonlyMap<number, Command>, dt = STEP) {
  if (m.winner !== null) return;
  m.tick++;
  m.time = Math.max(0, m.time - dt);
  ageEvents(m.shots, dt, 0.12);
  for (const actor of m.actors) stepActor(m, actor, inputs, dt);
  for (const a of m.actors) {
    if (a.hp > 0 && a.grounded) advanceGait(a.gait, a.speed, dt);
    else { a.gait.state = "idle"; a.gait.phase = 0; }
  }
  advanceGrenades(m, dt);
  recoverHealth(m, dt);
  if (m.time === 0)
    m.winner =
      m.scores[0] === m.scores[1] ? 2 : m.scores[0] > m.scores[1] ? 0 : 1;
}

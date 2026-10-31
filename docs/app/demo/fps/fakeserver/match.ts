/** Pure fixed-step match rules. No browser, React or Three dependency: future server authority lives here. */
import { wallDistance, blocks, spawnPoints, type SpawnPoint, type Vec, type Block } from "../shared/map";
export { wallDistance, blocks, type Vec, type Block } from "../shared/map";
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
  a.vy = 0;
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
    };
    spawn(a, m);
    m.actors.push(a);
  }
  return m;
}
export function blocked(x: number, z: number, r = 0.36, y = 0) {
  return blocks.some(
    (b) =>
      b.p[1] - b.size[1] / 2 < y + 1.8 &&
      b.p[1] + b.size[1] / 2 > y + 0.1 &&
      Math.abs(x - b.p[0]) < b.size[0] / 2 + r &&
      Math.abs(z - b.p[2]) < b.size[2] / 2 + r,
  );
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
  const surface: { block?: Block } = {};
  let distance = wallDistance(from, dir, 100, surface),
    victim: Actor | undefined,
    head = false;
  let impact: ImpactMaterial = surface.block ? (surface.block.kind === "crate" || surface.block.kind === "roof" ? "metal" : "concrete") : "none";
  const ground = dir[1] < -1e-9 ? -from[1] / dir[1] : Infinity;
  if (ground >= 0 && ground < distance) { distance = ground; impact = "ground"; }
  for (const b of m.actors) {
    if (b === a || b.hp <= 0) continue;
    for (const [height, radius, isHead] of [
      [1.1, 0.42, false],
      [1.65, 0.25, true],
    ] as const) {
      const d: Vec = [b.x - from[0], b.y + height - crouchOffset(b) - from[1], b.z - from[2]],
        t = d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2],
        q = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 - t * t;
      if (q > radius * radius) continue;
      const near = t - Math.sqrt(radius * radius - q);
      if (near > 0 && near < distance) {
        distance = near;
        victim = b;
        head = isHead;
      }
    }
  }
  const hit = !!victim && applyDamage(m, a, victim, head ? 70 : 34) > 0;

  m.shots.push({
    impact: victim ? "body" : impact,
    victim: victim?.id ?? -1,
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
    // Swept axis bounds against the same map boxes as bullets, with a 9 cm radius.
    for (const [axis, velocity, index] of [["x", "vx", 0], ["y", "vy", 1], ["z", "vz", 2]] as const) {
      const start = g[axis], end = start + g[velocity] * dt;
      let next = end;
      for (const block of blocks) {
        const p = [g.x, g.y, g.z];
        if (p.some((v, i) => i !== index && Math.abs(v - block.p[i]) > block.size[i] / 2 + 0.09)) continue;
        const lo = block.p[index] - block.size[index] / 2 - 0.09;
        const hi = block.p[index] + block.size[index] / 2 + 0.09;
        if (end > start && start <= lo && next >= lo) next = lo;
        if (end < start && start >= hi && next <= hi) next = hi;
      }
      if (axis === "y") next = Math.max(0.09, next);
      if (next !== end) g[velocity] *= -0.45;
      g[axis] = next;
    }
    if (g.y <= 0.091) { g.vx *= Math.exp(-dt * 5); g.vz *= Math.exp(-dt * 5); }
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

function stanceTarget(current: boolean, amount: number, requested: boolean) {
  return amount === (current ? 1 : 0) ? requested : current;
}

function updateCrouch(a: Actor, command: Command, dt: number) {
  a.crouching = stanceTarget(a.crouching, a.crouchAmount, command.crouch === true);
  a.crouchAmount = approachStance(a.crouchAmount, a.crouching, dt, STANCE_TIMING.crouch, STANCE_TIMING.stand);
}

function updateAim(a: Actor, command: Command, dt: number) {
  const weaponBusy = a.throwing > 0 || a.reload > 0;
  a.aiming = !weaponBusy && stanceTarget(a.aiming, a.aimAmount, command.aim === true);
  a.aimAmount = approachStance(a.aimAmount, a.aiming, dt, STANCE_TIMING.aimIn, STANCE_TIMING.aimOut);
}

function fullyStanding(a: Actor) {
  return !a.crouching && a.crouchAmount === 0;
}

/** One set of movement restrictions for human inputs, bot commands and future prediction. */
function movementSpeed(a: Actor, command: Command) {
  if (!fullyStanding(a)) return 1.8;
  if (a.throwing > 0 || a.aiming || a.aimAmount > 0) return 2.7;
  const canSprint = !command.fire && !command.aim && a.reload === 0;
  return command.sprint && canSprint ? 7 : 4.6;
}

function moveActor(a: Actor, command: Command, dt: number) {
  const speed = movementSpeed(a, command);
  const norm = Math.max(1, Math.hypot(command.forward, command.right));
  const sin = Math.sin(command.yaw), cos = Math.cos(command.yaw);
  const dx = ((-sin * command.forward + cos * command.right) * speed * dt) / norm;
  const dz = ((-cos * command.forward - sin * command.right) * speed * dt) / norm;
  const beforeX = a.x, beforeZ = a.z;
  if (!blocked(a.x + dx, a.z, 0.36, a.y)) a.x += dx;
  if (!blocked(a.x, a.z + dz, 0.36, a.y)) a.z += dz;
  a.speed = Math.hypot(a.x - beforeX, a.z - beforeZ) / dt;
  a.moving = a.speed > 0.12;
  if (command.jump && fullyStanding(a) && a.y === 0) a.vy = 4;
  a.vy -= 12 * dt;
  a.y = Math.max(0, a.y + a.vy * dt);
  if (a.y === 0) a.vy = 0;
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
    if (a.hp > 0 && a.y < 0.02) advanceGait(a.gait, a.speed, dt);
    else { a.gait.state = "idle"; a.gait.phase = 0; }
  }
  advanceGrenades(m, dt);
  recoverHealth(m, dt);
  if (m.time === 0)
    m.winner =
      m.scores[0] === m.scores[1] ? 2 : m.scores[0] > m.scores[1] ? 0 : 1;
}

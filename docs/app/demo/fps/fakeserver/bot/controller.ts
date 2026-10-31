import { mapFeatures, physics } from "../../shared/world";
/** Server-side tactical intent and navigation. Gameplay outcomes stay in shared match rules. */
import { blocked, wallDistance, eyeHeight, STEP, idleCommand,
  type Actor, type ActorController, type ControllerMatch, type ControllerActor } from "../match";

/** Sweep the bot footprint, not just its center ray, across the ground plane. */
export function walkableSegment(x: number, z: number, tx: number, tz: number) {
  return physics.walkable([x, 0, z], [tx, 0, tz]);
}

/** Skip grid corners only when the entire footprint can reach the next waypoint. */
export function followRoute(a: Pick<Actor, "x" | "z">, route: [number, number][]) {
  let skip = 0;
  for (let i = 1; i < route.length; i++) {
    const next = route[i];
    if (!walkableSegment(a.x, a.z, next[0], next[1])) break;
    skip = i;
  }
  if (skip) route.splice(0, skip);
  const p = route[0];
  if (route.length === 1 && p && Math.hypot(p[0] - a.x, p[1] - a.z) < 0.15)
    route.length = 0;
  return route[0];
}

function visible(a: Actor, b: Actor, crouching?: boolean) {
  const sourceY = a.y + eyeHeight(crouching === undefined ? a : { crouching });
  const dx = b.x - a.x,
    dz = b.z - a.z,
    dy = b.y + eyeHeight(b) - sourceY,
    d = Math.hypot(dx, dy, dz);
  return (
    d < 0.001 || wallDistance([a.x, sourceY, a.z], [dx / d, dy / d, dz / d], d) >= d - 0.01
  );
}
const GRID = 20,
  ROWS = 24;
const cell = (x: number, z: number) =>
  [
    Math.max(0, Math.min(GRID - 1, Math.floor((x + 20) / 2))),
    Math.max(0, Math.min(ROWS - 1, Math.floor((z + 24) / 2))),
  ] as const;
const nav = Array.from(
  { length: GRID * ROWS },
  (_, i) => !blocked((i % GRID) * 2 - 19, Math.floor(i / GRID) * 2 - 23, 0.5),
);
export function routeTo(
  x: number,
  z: number,
  tx: number,
  tz: number,
  path: [number, number][] = [],
): [number, number][] {
  path.length = 0;
  const nearest = (px: number, pz: number) => {
    const [cx, cz] = cell(px, pz);
    const index = cz * GRID + cx;
    if (nav[index]) return index;
    let best = index,
      distance = Infinity;
    nav.forEach((walkable, i) => {
      if (!walkable) return;
      const d =
        ((i % GRID) * 2 - 19 - px) ** 2 +
        (Math.floor(i / GRID) * 2 - 23 - pz) ** 2;
      if (d < distance) {
        distance = d;
        best = i;
      }
    });
    return best;
  };
  const start = nearest(x, z),
    goal = nearest(tx, tz),
    prev = new Int16Array(nav.length).fill(-1),
    queue = [start];
  prev[start] = start;
  for (let i = 0; i < queue.length && prev[goal] < 0; i++) {
    const n = queue[i];
    for (const d of [-1, 1, -GRID, GRID]) {
      const k = n + d;
      if (
        k < 0 ||
        k >= nav.length ||
        Math.abs((k % GRID) - (n % GRID)) > 1 ||
        !nav[k] ||
        blocked(
          (n % GRID) + (k % GRID) - 19,
          Math.floor(n / GRID) + Math.floor(k / GRID) - 23,
          0.5,
        ) ||
        prev[k] >= 0
      )
        continue;
      prev[k] = n;
      queue.push(k);
    }
  }
  if (prev[goal] < 0) return path;
  for (let n = goal; n !== start; n = prev[n])
    path.push([(n % GRID) * 2 - 19, Math.floor(n / GRID) * 2 - 23]);
  path.reverse();
  const goalX = (goal % GRID) * 2 - 19, goalZ = Math.floor(goal / GRID) * 2 - 23;
  // Replanning inside the goal cell must not erase the final approach.
  if (walkableSegment(goalX, goalZ, tx, tz)) {
    if (!path.length || goalX !== tx || goalZ !== tz) path.push([tx, tz]);
  } else if (!path.length && Math.hypot(x - goalX, z - goalZ) > 0.15) {
    path.push([goalX, goalZ]);
  }
  // A path starts at a cell center; an actor may be offset toward a crate corner.
  if (path[0] && !walkableSegment(x, z, path[0][0], path[0][1]))
    path.unshift([(start % GRID) * 2 - 19, Math.floor(start / GRID) * 2 - 23]);
  return path;
}
export class BotController implements ActorController {
  private readonly output = idleCommand();
  private seed: number;
  private readonly route: [number, number][] = [];
  private repath = 0;
  private flanked = false;
  private targetId = -1;
  private trackedTarget = -1;
  private seenFor = 0;
  private lostFor = 1;
  private reaction = 0.45;
  private aimYaw = 0;
  private aimPitch = 0;
  constructor(seed = 317) { this.seed = seed; }
  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  private trackEnemy(m: ControllerMatch, a: ControllerActor, enemy: ControllerActor, sight: boolean, dt: number) {
    if (this.trackedTarget !== enemy.id) {
      this.trackedTarget = enemy.id; this.seenFor = 0; this.lostFor = 1;
      this.reaction = 0.35 + this.random() * 0.25;
    }
    if (sight) {
      if (this.lostFor > 0.25) this.seenFor = 0;
      this.lostFor = 0; this.seenFor += dt;
      // Coherent aim error, rather than a new random direction every tick.
      // Bots aim near the chest and have imperfect tracking; recoil still applies normally.
      const time = m.tick * STEP, phase = a.id * 2.39;
      this.aimYaw = Math.atan2(-(enemy.x - a.x), -(enemy.z - a.z))
        + Math.sin(time * 1.7 + phase) * 0.035 + Math.sin(time * 3.1 + phase) * 0.012;
      this.aimPitch = Math.atan2(enemy.y + eyeHeight(enemy) - 0.25 - a.y - eyeHeight(a), Math.hypot(enemy.x - a.x, enemy.z - a.z))
        + Math.sin(time * 1.3 + phase) * 0.018;
    } else this.lostFor += dt;
    const tracking = this.lostFor <= 0.25;
    const desiredPitch = tracking ? this.aimPitch : 0;
    this.output.pitch = a.pitch + (desiredPitch - a.pitch) * (1 - Math.exp(-6 * dt));
    return tracking;
  }

  private updateRoute(a: ControllerActor, enemy: ControllerActor, dt: number) {
    this.repath -= dt;
    if (this.repath <= 0) {
      const point = mapFeatures.flanks[(a.id + 1) % mapFeatures.flanks.length];
      if (point && Math.hypot(a.x - point[0], a.z - point[2]) < 3) this.flanked = true;
      const flank = point && !this.flanked && a.id % 3 !== 0;
      routeTo(
        a.x,
        a.z,
        flank ? point[0] : enemy.x,
        flank ? point[2] : enemy.z,
        this.route,
      );
      this.repath = 0.65 + this.random() * 0.4;
    }
  }

  /** Tactical intent only; transition timing belongs to the shared actor rules. */
  private chooseCombatStance(a: ControllerActor, enemy: ControllerActor, tracking: boolean) {
    const distanceSquared = (enemy.x - a.x) ** 2 + (enemy.z - a.z) ** 2;
    this.output.aim = tracking;
    // Hysteresis is a target-distance preference, not another stance state machine.
    // Test the proposed eye height so crouching cannot hide the target behind cover.
    this.output.crouch = tracking && distanceSquared > (a.crouching ? 81 : 121)
      && visible(a, enemy, true);
    if (this.output.crouch) this.output.forward = this.output.right = 0;
  }

  private steer(a: ControllerActor, dt: number) {
    const command = this.output;
    const desiredYaw = command.yaw;
    const turn = Math.atan2(Math.sin(desiredYaw - a.yaw), Math.cos(desiredYaw - a.yaw));
    command.yaw = a.yaw + Math.max(-3.5 * dt, Math.min(3.5 * dt, turn * (1 - Math.exp(-8 * dt))));
    // Analog steering preserves route direction while the bot turns its view.
    const delta = desiredYaw - command.yaw;
    const forward = command.forward, right = command.right;
    const throttle = 3.1 / 4.6;
    command.forward = (forward * Math.cos(delta) + right * Math.sin(delta)) * throttle;
    command.right = (-forward * Math.sin(delta) + right * Math.cos(delta)) * throttle;
    command.yaw = Math.atan2(Math.sin(command.yaw), Math.cos(command.yaw));
    command.fire &&= Math.abs(turn) < 0.15;
  }

  command(m: ControllerMatch, a: ControllerActor, dt: number) {
    const command = this.output;
    command.forward = command.right = command.pitch = 0;
    command.fire = command.reload = command.jump = command.aim = command.sprint = command.crouch = command.grenade = false;
    command.yaw = a.yaw;
    if (a.hp <= 0 || m.winner !== null) {
      this.route.length = 0; this.repath = 0; this.flanked = false; this.targetId = -1;
      this.trackedTarget = -1; this.seenFor = 0; this.lostFor = 1;
      return command;
    }
    let enemy: ControllerActor | undefined;
    let nearest = Infinity;
    let retained: ControllerActor | undefined;
    for (const candidate of m.actors) {
      if (candidate.team === a.team || candidate.hp <= 0) continue;
      const distance = (candidate.x - a.x) ** 2 + (candidate.z - a.z) ** 2;
      if (candidate.id === this.targetId) retained = candidate;
      if (distance < nearest) { nearest = distance; enemy = candidate; }
    }
    // Switch only for a materially closer target; avoid tick-to-tick heading flicker.
    if (retained && (retained.x - a.x) ** 2 + (retained.z - a.z) ** 2 <= nearest * 1.44)
      enemy = retained;
    this.targetId = enemy?.id ?? -1;
    if (enemy) {
      const sight = visible(a, enemy);
      const tracking = this.trackEnemy(m, a, enemy, sight, dt);
      this.updateRoute(a, enemy, dt);
      const dest = followRoute(a, this.route);
      if (dest && !tracking) {
        command.yaw = Math.atan2(-(dest[0] - a.x), -(dest[1] - a.z));
        command.forward = 1;
      } else {
        command.yaw = tracking ? this.aimYaw : a.yaw;
        const burstTime = this.seenFor - this.reaction;
        command.fire = sight && burstTime >= 0 && burstTime % 0.9 < 0.35;
        command.forward = sight && Math.hypot(enemy.x - a.x, enemy.z - a.z) > 14 ? 1 : 0;
        command.right = sight ? (Math.sin(m.time + a.id) > 0.4 ? 0.4 : -0.4) : 0;
      }
      command.reload = a.ammo === 0;
      this.chooseCombatStance(a, enemy, tracking);
    }

    this.steer(a, dt);
    if (enemy && command.fire && a.grenades > 0 && a.throwing === 0 && m.tick % 180 === a.id * 17) {
      const distance = Math.hypot(enemy.x - a.x, enemy.z - a.z);
      command.grenade = distance > 8 && distance < 18 && !m.actors.some(friend => friend.team === a.team && Math.hypot(friend.x - enemy.x, friend.z - enemy.z) < 5);
      if (command.grenade) { command.pitch = 0.18; command.fire = false; }
    }
    return command;
  }
}

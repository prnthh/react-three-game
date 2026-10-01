import type { SurfaceGrid } from './spatial';

// Demo-owned kinematic movement: one-way platforms plus axis-aligned solid walls.
export type Position = [number, number, number];
export type SurfaceOrientation = {
    center: Position;
    halfSize: Position;
    quaternion: [number, number, number, number];
};
export type Surface = {
    minX: number; maxX: number; minZ: number; maxZ: number; top: number; bottom?: number; solid?: boolean;
    orientation?: SurfaceOrientation;
};
export type JumperState = {
    position: Position; velocityY: number; velocity: [number, number]; grounded: boolean;
    crouched: boolean;
    wallRunNormal: [number, number] | null;
    wallClimbNormal: [number, number] | null; wallJumpNormal: [number, number] | null;
};
export type MovementSettings = { speed: number; jumpSpeed: number; jumpBoost?: number; slideBoost?: number; wallRunSpeed?: number };
export const PLAYER_RADIUS = 0.3;
export const STANDING_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1;
const HOP_SPEED_CAP = 27;
const FALL_SPEED_CAP = 34;
const WALL_RUN_VERTICAL_SPEED = 1.5;
const WALL_CLIMB_IMPULSE = 2.5;
const WALL_JUMP_BACK_IMPULSE = 4;
// Entry requires the wall to sit clearly beside the view, not in front of it.
const WALL_RUN_ENTRY_MAX_NORMAL_ALIGNMENT = 0.5;

export function createJumperState(position: Position): JumperState {
    return { position: [...position], velocityY: 0, velocity: [0, 0], grounded: false,
        crouched: false, wallRunNormal: null, wallClimbNormal: null, wallJumpNormal: null };
}
function sameWall(a: [number, number] | null, b: [number, number] | null) {
    return !!a && !!b && a[0] === b[0] && a[1] === b[1];
}
function overlaps(x: number, z: number, s: Surface, radius = PLAYER_RADIUS) {
    return x + radius > s.minX + 1e-6 && x - radius < s.maxX - 1e-6
        && z + radius > s.minZ + 1e-6 && z - radius < s.maxZ - 1e-6;
}
function touchesHeight(y: number, height: number, s: Surface) {
    return y < s.top - 0.01 && y + height > (s.bottom ?? -Infinity) + 0.01;
}

function rotateByQuaternion([x, y, z]: Position, [qx, qy, qz, qw]: SurfaceOrientation['quaternion']): Position {
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    return [
        ix * qw + iw * -qx + iy * -qz - iz * -qy,
        iy * qw + iw * -qy + iz * -qx - ix * -qz,
        iz * qw + iw * -qz + ix * -qy - iy * -qx,
    ];
}

/** Height of a surface's actual rotated top face at a world-space X/Z point. */
export function surfaceTopAt(surface: Surface, x: number, z: number, radius = 0) {
    const orientation = surface.orientation;
    if (!orientation) {
        return x + radius > surface.minX + 1e-6 && x - radius < surface.maxX - 1e-6
            && z + radius > surface.minZ + 1e-6 && z - radius < surface.maxZ - 1e-6 ? surface.top : null;
    }

    const { center, halfSize, quaternion } = orientation;
    const normal = rotateByQuaternion([0, 1, 0], quaternion);
    if (normal[1] <= 1e-4) return null;
    const topCenterOffset = rotateByQuaternion([0, halfSize[1], 0], quaternion);
    const topCenter: Position = [center[0] + topCenterOffset[0], center[1] + topCenterOffset[1], center[2] + topCenterOffset[2]];
    const y = topCenter[1] - (normal[0] * (x - topCenter[0]) + normal[2] * (z - topCenter[2])) / normal[1];
    const inverse: SurfaceOrientation['quaternion'] = [-quaternion[0], -quaternion[1], -quaternion[2], quaternion[3]];
    const local = rotateByQuaternion([x - center[0], y - center[1], z - center[2]], inverse);
    return Math.abs(local[0]) <= halfSize[0] + radius + 1e-6
        && Math.abs(local[2]) <= halfSize[2] + radius + 1e-6 ? y : null;
}
function wallAt(x: number, y: number, z: number, height: number, walls: Surface[]): [number, number] | null {
    for (const s of walls) {
        if (!touchesHeight(y, height, s)) continue;
        const reach = PLAYER_RADIUS + 0.08;
        if (z > s.minZ - PLAYER_RADIUS && z < s.maxZ + PLAYER_RADIUS) {
            if (x <= s.minX && s.minX - x <= reach) return [-1, 0];
            if (x >= s.maxX && x - s.maxX <= reach) return [1, 0];
        }
        if (x > s.minX - PLAYER_RADIUS && x < s.maxX + PLAYER_RADIUS) {
            if (z <= s.minZ && s.minZ - z <= reach) return [0, -1];
            if (z >= s.maxZ && z - s.maxZ <= reach) return [0, 1];
        }
    }
    return null;
}

export function stepJumper(state: JumperState,
    input: { x: number; z: number; jump: boolean; crouch?: boolean; facingX?: number; facingZ?: number },
    settings: MovementSettings, world: Surface[] | SurfaceGrid, dt: number): JumperState {
    /* ── Contact, stance, and input ─────────────────────────────────────── */
    const [x, y, z] = state.position;
    let surfaces = Array.isArray(world) ? world : world.query({
        minX: x - PLAYER_RADIUS - 0.081, maxX: x + PLAYER_RADIUS + 0.081,
        minY: y, maxY: y + STANDING_HEIGHT,
        minZ: z - PLAYER_RADIUS - 0.081, maxZ: z + PLAYER_RADIUS + 0.081,
    });
    let walls = surfaces.filter(s => s.solid);
    const blockedStanding = state.crouched && walls.some(s => overlaps(x, z, s) && touchesHeight(y, STANDING_HEIGHT, s));
    const crouched = !!input.crouch || blockedStanding;
    const height = crouched ? CROUCH_HEIGHT : STANDING_HEIGHT;
    const wishLength = Math.hypot(input.x, input.z);
    const wx = input.x / Math.max(1, wishLength), wz = input.z / Math.max(1, wishLength);
    let [vx, vz] = state.velocity;
    let vy = state.velocityY;
    const contact = wallAt(x, y, z, height, walls);
    const along = contact ? Math.abs(vx * -contact[1] + vz * contact[0]) : 0;
    const alongInput = contact ? Math.abs(wx * -contact[1] + wz * contact[0]) : 0;
    const wallJumpLatched = sameWall(state.wallJumpNormal, contact);
    let wallJumpNormal = wallJumpLatched ? state.wallJumpNormal : null;
    const facingLength = Math.hypot(input.facingX ?? wx, input.facingZ ?? wz);
    const facingX = (input.facingX ?? wx) / Math.max(1, facingLength);
    const facingZ = (input.facingZ ?? wz) / Math.max(1, facingLength);
    const facingNormal = contact ? facingX * contact[0] + facingZ * contact[1] : 0;
    const movingForward = wishLength > 0.1 && wx * facingX + wz * facingZ > 0.5;
    const canUseWall = !state.grounded && !crouched && !wallJumpLatched && !!contact && movingForward;
    let wallRunNormal = canUseWall && Math.abs(facingNormal) <= WALL_RUN_ENTRY_MAX_NORMAL_ALIGNMENT
        && (along > 1 || alongInput > 0.25) ? contact : null;
    let wallClimbNormal = canUseWall && facingNormal < -WALL_RUN_ENTRY_MAX_NORMAL_ALIGNMENT ? contact : null;
    const startingWallClimb = !!wallClimbNormal && !sameWall(state.wallClimbNormal, wallClimbNormal);

    /* ── Ground, air, and slide locomotion ─────────────────────────────── */
    const accelerate = (amount: number, target: number) => {
        const add = Math.min(amount * dt, Math.max(0, target - (vx * wx + vz * wz)));
        vx += wx * add; vz += wz * add;
    };
    if (state.grounded && crouched) {
        let speed = Math.hypot(vx, vz);
        if (!state.crouched && speed > 0.5) {
            const boost = settings.slideBoost ?? 3;
            vx *= (speed + boost) / speed; vz *= (speed + boost) / speed;
            speed += boost;
        }
        const slideSpeed = settings.speed + (settings.slideBoost ?? 3);
        const decayed = Math.max(wishLength && speed > 0.5 ? slideSpeed : 0, speed - 8 * dt);
        if (speed > 0) { vx *= decayed / speed; vz *= decayed / speed; }
    } else {
        const drag = state.grounded ? (wishLength ? 0.7 : 12) : 0;
        vx *= Math.exp(-drag * dt); vz *= Math.exp(-drag * dt);
        const reversing = vx * wx + vz * wz < 0;
        accelerate(state.grounded ? (reversing ? 90 : 45) : (reversing ? 45 : 22), settings.speed);
    }

    /* ── Momentum steering ─────────────────────────────────────────────── */
    // Redirect momentum without discarding hop speed. Slides keep the widest turns;
    // opposite input brakes first, avoiding an arbitrary sideways U-turn.
    if (wishLength && Math.hypot(vx, vz) > 0 && vx * wx + vz * wz >= 0) {
        const angle = Math.atan2(vx * wz - vz * wx, vx * wx + vz * wz);
        const grip = state.grounded ? (crouched ? 2.5 : 10) : 5;
        const turn = angle * (1 - Math.exp(-grip * dt));
        const cos = Math.cos(turn), sin = Math.sin(turn);
        [vx, vz] = [vx * cos - vz * sin, vx * sin + vz * cos];
    }

    /* ── Wallclimbing ──────────────────────────────────────────────────── */
    if (startingWallClimb) vy += WALL_CLIMB_IMPULSE;

    /* ── Wallrunning ───────────────────────────────────────────────────── */
    if (wallRunNormal) {
        const into = vx * wallRunNormal[0] + vz * wallRunNormal[1];
        vx -= wallRunNormal[0] * into; vz -= wallRunNormal[1] * into;
        const tangent = [-wallRunNormal[1], wallRunNormal[0]];
        const desiredAlong = wx * tangent[0] + wz * tangent[1];
        // Forward-facing input chooses the direction along the wall.
        const sign = Math.sign(desiredAlong) || Math.sign(vx * tangent[0] + vz * tangent[1]) || 1;
        const speed = Math.max(Math.hypot(vx, vz), settings.wallRunSpeed ?? 13);
        vx = tangent[0] * sign * speed; vz = tangent[1] * sign * speed;
        // Wall contact softens a fall and permits a small rise, but must not
        // preserve the full upward velocity from the jump that reached it.
        vy = Math.max(-WALL_RUN_VERTICAL_SPEED, Math.min(vy, WALL_RUN_VERTICAL_SPEED));
    }

    /* ── Ground jump and shared wall jump ──────────────────────────────── */
    const attachedWallNormal = wallRunNormal ?? wallClimbNormal;
    const groundJumping = input.jump && state.grounded;
    const wallJumping = input.jump && !state.grounded && !!attachedWallNormal;
    const jumping = groundJumping || wallJumping;
    if (jumping) {
        vy = settings.jumpSpeed;
        const speed = Math.hypot(vx, vz);
        const dx = speed > 0.1 ? vx / speed : wishLength ? wx : 0;
        const dz = speed > 0.1 ? vz / speed : wishLength ? wz : 0;
        vx += dx * (settings.jumpBoost ?? 1); vz += dz * (settings.jumpBoost ?? 1);
        if (wallJumping && attachedWallNormal) {
            vx += attachedWallNormal[0] * WALL_JUMP_BACK_IMPULSE;
            vz += attachedWallNormal[1] * WALL_JUMP_BACK_IMPULSE;
            wallJumpNormal = attachedWallNormal;
            wallRunNormal = null;
            wallClimbNormal = null;
        }
    }

    /* ── Speed limits and gravity ──────────────────────────────────────── */
    const speed = Math.hypot(vx, vz);
    const cap = !state.grounded && !wallRunNormal && !jumping && vy < 0 ? FALL_SPEED_CAP : HOP_SPEED_CAP;
    if (speed > cap) { vx *= cap / speed; vz *= cap / speed; }
    vy -= (wallRunNormal ? 3 : 20) * dt;

    /* ── Horizontal collision sweep ───────────────────────────────────── */
    const moveX = vx, moveZ = vz;
    let nx = x + vx * dt, nz = z + vz * dt;
    if (!Array.isArray(world)) {
        // Query the entire sweep after impulses and speed limits, not just the
        // destination cell. Padding includes rotated top-face radius extension
        // and the small downward slope-following allowance.
        const pad = 2 * PLAYER_RADIUS + 0.001;
        const endY = y + vy * dt;
        surfaces = world.query({
            minX: Math.min(x, nx) - pad, maxX: Math.max(x, nx) + pad,
            minY: Math.min(y, endY) - pad, maxY: Math.max(y, endY) + STANDING_HEIGHT + pad,
            minZ: Math.min(z, nz) - pad, maxZ: Math.max(z, nz) + pad,
        });
        walls = surfaces.filter(s => s.solid);
    }
    // Sweep each horizontal axis against the expanded wall faces (no tunneling).
    for (const s of walls) {
        if (!touchesHeight(y, height, s) || z + PLAYER_RADIUS <= s.minZ || z - PLAYER_RADIUS >= s.maxZ) continue;
        if (moveX > 0 && x + PLAYER_RADIUS <= s.minX + 0.001 && nx + PLAYER_RADIUS > s.minX) { nx = Math.min(nx, s.minX - PLAYER_RADIUS); vx = 0; }
        if (moveX < 0 && x - PLAYER_RADIUS >= s.maxX - 0.001 && nx - PLAYER_RADIUS < s.maxX) { nx = Math.max(nx, s.maxX + PLAYER_RADIUS); vx = 0; }
    }
    for (const s of walls) {
        if (!touchesHeight(y, height, s) || nx + PLAYER_RADIUS <= s.minX || nx - PLAYER_RADIUS >= s.maxX) continue;
        if (moveZ > 0 && z + PLAYER_RADIUS <= s.minZ + 0.001 && nz + PLAYER_RADIUS > s.minZ) { nz = Math.min(nz, s.minZ - PLAYER_RADIUS); vz = 0; }
        if (moveZ < 0 && z - PLAYER_RADIUS >= s.maxZ - 0.001 && nz - PLAYER_RADIUS < s.maxZ) { nz = Math.max(nz, s.maxZ + PLAYER_RADIUS); vz = 0; }
    }

    /* ── Vertical collision and landing ───────────────────────────────── */
    let ny = y + vy * dt;
    if (vy > 0) for (const s of walls) {
        if (s.bottom !== undefined && overlaps(nx, nz, s) && y + height <= s.bottom + 0.001 && ny + height > s.bottom) {
            ny = Math.min(ny, s.bottom - height); vy = 0;
        }
    }
    let landing: { top: number } | undefined;
    if (vy <= 0) for (const surface of surfaces) {
        const radius = surface.solid ? PLAYER_RADIUS : 0;
        const previousTop = surfaceTopAt(surface, x, z, radius);
        const nextTop = surfaceTopAt(surface, nx, nz, radius);
        if (previousTop === null || nextTop === null || y < previousTop - 0.001) continue;
        const crossedTop = ny <= nextTop;
        const followedSlope = state.grounded && Math.abs(y - previousTop) <= 0.01
            && nextTop <= y && y - nextTop <= 0.2;
        if ((crossedTop || followedSlope) && (!landing || nextTop > landing.top)) landing = { top: nextTop };
    }
    if (landing) {
        ny = landing.top; vy = 0; wallRunNormal = null; wallClimbNormal = null; wallJumpNormal = null;
        const landingSpeed = Math.hypot(vx, vz);
        if (landingSpeed > HOP_SPEED_CAP) { vx *= HOP_SPEED_CAP / landingSpeed; vz *= HOP_SPEED_CAP / landingSpeed; }
    }
    return { position: [nx, ny, nz], velocity: [vx, vz], velocityY: vy, grounded: !!landing, crouched,
        wallRunNormal, wallClimbNormal, wallJumpNormal };
}

/** Roll in camera-local space, away from the wall; turning adds a smaller inertial lean. */
export function cameraRoll(turnRate: number, wallNormal: [number, number] | null, forwardX: number, forwardZ: number) {
    const sway = Math.max(-0.065, Math.min(0.065, turnRate * 0.018));
    const wall = wallNormal ? -(wallNormal[0] * -forwardZ + wallNormal[1] * forwardX) * 0.2 : 0;
    return Math.max(-0.24, Math.min(0.24, sway + wall));
}

export function cameraFov(speed: number) {
    const t = Math.max(0, Math.min(1, speed / FALL_SPEED_CAP));
    return 75 + 20 * t * t * (3 - 2 * t);
}

export const JUMPER_STEP = 1 / 120;
export function createJumperSimulation(position: Position) {
    const current = createJumperState(position);
    return { current, previous: current, remainder: 0 };
}
export type JumperSimulation = ReturnType<typeof createJumperSimulation>;

/** Fixed simulation, interpolated presentation; cap catch-up after a suspended frame. */
export function advanceJumper(sim: JumperSimulation, delta: number,
    input: Parameters<typeof stepJumper>[1], settings: Parameters<typeof stepJumper>[2],
    surfaces: Parameters<typeof stepJumper>[3], onStep?: (input: Parameters<typeof stepJumper>[1]) => void) {
    /* ── Fixed-step simulation ─────────────────────────────────────────── */
    sim.remainder += Math.min(Math.max(delta, 0), 0.1);
    let steps = 0;
    while (sim.remainder + 1e-12 >= JUMPER_STEP) {
        sim.previous = sim.current;
        const command = { ...input, jump: input.jump && steps === 0 };
        sim.current = stepJumper(sim.current, command, settings, surfaces, JUMPER_STEP);
        onStep?.(command);
        sim.remainder = Math.max(0, sim.remainder - JUMPER_STEP);
        steps++;
    }
    return steps;
}

export function jumperRenderPosition(sim: JumperSimulation): Position {
    /* ── Render interpolation ──────────────────────────────────────────── */
    const alpha = sim.remainder / JUMPER_STEP;
    return sim.current.position.map((value, i) => sim.previous.position[i] + (value - sim.previous.position[i]) * alpha) as Position;
}

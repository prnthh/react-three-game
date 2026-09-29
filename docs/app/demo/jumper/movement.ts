// Demo-owned kinematic movement: one-way platforms plus axis-aligned solid walls.
export type Position = [number, number, number];
export type Surface = { minX: number; maxX: number; minZ: number; maxZ: number; top: number; bottom?: number; solid?: boolean };
export type JumperState = {
    position: Position; velocityY: number; velocity: [number, number]; grounded: boolean;
    crouched: boolean; wallNormal: [number, number] | null; wallTime: number; wallCooldown: number;
};
export type MovementSettings = { speed: number; jumpSpeed: number; jumpBoost?: number; slideBoost?: number; wallRunSpeed?: number };
export const PLAYER_RADIUS = 0.3;
export const STANDING_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1;
const MAX_SPEED = 24;

export function createJumperState(position: Position): JumperState {
    return { position: [...position], velocityY: 0, velocity: [0, 0], grounded: false,
        crouched: false, wallNormal: null, wallTime: 0, wallCooldown: 0 };
}
function overlaps(x: number, z: number, s: Surface, radius = PLAYER_RADIUS) {
    return x + radius > s.minX + 1e-6 && x - radius < s.maxX - 1e-6
        && z + radius > s.minZ + 1e-6 && z - radius < s.maxZ - 1e-6;
}
function touchesHeight(y: number, height: number, s: Surface) {
    return y < s.top - 0.01 && y + height > (s.bottom ?? -Infinity) + 0.01;
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
    input: { x: number; z: number; jump: boolean; crouch?: boolean },
    settings: MovementSettings, surfaces: Surface[], dt: number): JumperState {
    const [x, y, z] = state.position;
    const walls = surfaces.filter(s => s.solid);
    const blockedStanding = state.crouched && walls.some(s => overlaps(x, z, s) && touchesHeight(y, STANDING_HEIGHT, s));
    const crouched = !!input.crouch || blockedStanding;
    const height = crouched ? CROUCH_HEIGHT : STANDING_HEIGHT;
    const wishLength = Math.hypot(input.x, input.z);
    const wx = input.x / Math.max(1, wishLength), wz = input.z / Math.max(1, wishLength);
    let [vx, vz] = state.velocity;
    let vy = state.velocityY;
    let cooldown = Math.max(0, state.wallCooldown - dt);
    const contact = wallAt(x, y, z, height, walls);
    const along = contact ? Math.abs(vx * -contact[1] + vz * contact[0]) : 0;
    const alongInput = contact ? Math.abs(wx * -contact[1] + wz * contact[0]) : 0;
    const wallTime = state.wallNormal && contact && state.wallNormal[0] === contact[0] && state.wallNormal[1] === contact[1]
        ? state.wallTime + dt : 0;
    let wallNormal = !state.grounded && !crouched && cooldown === 0 && contact
        && wx * contact[0] + wz * contact[1] <= 0.25
        && (along > 1 || alongInput > 0.25) && wallTime < 2 ? contact : null;
    if (state.wallNormal && !wallNormal) cooldown = Math.max(cooldown, 0.25);

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
        const decayed = Math.max(0, speed - 8 * dt);
        if (speed > 0) { vx *= decayed / speed; vz *= decayed / speed; }
    } else {
        const drag = state.grounded ? (wishLength ? 0.7 : 12) : 0.08;
        vx *= Math.exp(-drag * dt); vz *= Math.exp(-drag * dt);
        accelerate(state.grounded ? 45 : 10, settings.speed);
    }
    if (wallNormal) {
        const into = vx * wallNormal[0] + vz * wallNormal[1];
        vx -= wallNormal[0] * into; vz -= wallNormal[1] * into;
        const tangent = [-wallNormal[1], wallNormal[0]];
        const sign = Math.sign(vx * tangent[0] + vz * tangent[1] || wx * tangent[0] + wz * tangent[1]);
        const speed = Math.max(Math.hypot(vx, vz), settings.wallRunSpeed ?? 7);
        vx = tangent[0] * sign * speed; vz = tangent[1] * sign * speed;
        vy = Math.max(vy, -1.5);
    }
    const jumping = input.jump && (state.grounded || !!wallNormal);
    if (jumping) {
        vy = settings.jumpSpeed;
        const speed = Math.hypot(vx, vz);
        const dx = speed > 0.1 ? vx / speed : wishLength ? wx : 0;
        const dz = speed > 0.1 ? vz / speed : wishLength ? wz : 0;
        vx += dx * (settings.jumpBoost ?? 2); vz += dz * (settings.jumpBoost ?? 2);
        if (wallNormal) {
            vx += wallNormal[0] * 7; vz += wallNormal[1] * 7;
            cooldown = 0.3; wallNormal = null;
        }
    }
    const speed = Math.hypot(vx, vz);
    if (speed > MAX_SPEED) { vx *= MAX_SPEED / speed; vz *= MAX_SPEED / speed; }
    vy -= (wallNormal ? 3 : 20) * dt;
    const moveX = vx, moveZ = vz;
    let nx = x + vx * dt, nz = z + vz * dt;
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
    let ny = y + vy * dt;
    if (vy > 0) for (const s of walls) {
        if (s.bottom !== undefined && overlaps(nx, nz, s) && y + height <= s.bottom + 0.001 && ny + height > s.bottom) {
            ny = Math.min(ny, s.bottom - height); vy = 0;
        }
    }
    const landing = vy <= 0 ? surfaces.filter(s => overlaps(nx, nz, s, s.solid ? PLAYER_RADIUS : 0)
        && y >= s.top - 0.001 && ny <= s.top).sort((a, b) => b.top - a.top)[0] : undefined;
    if (landing) { ny = landing.top; vy = 0; wallNormal = null; }
    return { position: [nx, ny, nz], velocity: [vx, vz], velocityY: vy, grounded: !!landing, crouched,
        wallNormal, wallTime: wallNormal ? wallTime : 0, wallCooldown: cooldown };
}

/** Roll in camera-local space, away from the wall; turning adds a smaller inertial lean. */
export function cameraRoll(turnRate: number, wallNormal: [number, number] | null, forwardX: number, forwardZ: number) {
    const sway = Math.max(-0.065, Math.min(0.065, turnRate * 0.018));
    const wall = wallNormal ? -(wallNormal[0] * -forwardZ + wallNormal[1] * forwardX) * 0.2 : 0;
    return Math.max(-0.24, Math.min(0.24, sway + wall));
}

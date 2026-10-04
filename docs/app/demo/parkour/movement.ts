import type { SurfaceGrid } from './spatial';
import { PLAYER_RADIUS, overlaps, touchesHeight, surfaceTopAt, uprightWall, wallAt, sameNormal, sweepWall,
    type Position, type Surface } from './collision';

// Demo-owned kinematic movement with yaw-aware box collision.
export type ParkourState = {
    position: Position; velocityY: number; velocity: [number, number]; grounded: boolean;
    crouched: boolean;
    wallNormal: [number, number] | null;
    wallTime: number; // Seconds since attaching to this wall.
    climbRemaining: number | null; // Seconds of climb support; null means unused, zero means spent.
    jumpBuffer: number; // Seconds remaining to consume an early jump press.
};
export type MovementSettings = { speed: number; jumpSpeed: number; slideBoost?: number };
export const STANDING_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1;
export const GRAVITY = 20;
const RUN_ACCELERATION = 100;
const AIR_ACCELERATION = 20;
const AIR_TURN_RATE = 5;
const CROUCH_ACCELERATION = 20;
const WALL_SPEED_MULTIPLIER = 16.5 / 13;
export const CROUCH_SPEED = 5;
const GROUND_FRICTION = 6;
const STOP_SPEED = 7.5;
const SLIDE_DECELERATION = 14;
// Slide entry stops adding speed at this limit; carried momentum is not clamped.
const SLIDE_BOOST_SPEED_LIMIT = 27;
const WALL_JUMP_IMPULSE = 4;
const WALL_PUSH_IMPULSE = 2;
const WALLRUN_JUMP_MIN_ANGLE = Math.PI / 6; // Minimum departure angle from the wall tangent.
// Retain early jump presses until contact or expiry.
const JUMP_BUFFER = 0.1;
// Timed climb drives upward toward this cap, once per attachment.
const WALL_CLIMB_SPEED = 4;
const WALL_CLIMB_DURATION = 0.6;
const WALLCLIMB_CUTOFF_ANGLE = 15 * Math.PI / 180; // Measured from directly into the wall.

export const DEFAULT_MOVEMENT_SETTINGS = { speed: 13, jumpSpeed: 7.5, slideBoost: 3 };

/** One head-on angle check shared by wall jumps and camera presentation. */
export function isWallClimbing(normal: [number, number] | null, facingX: number, facingZ: number) {
    return !!normal && -(normal[0] * facingX + normal[1] * facingZ) >= Math.cos(WALLCLIMB_CUTOFF_ANGLE);
}

// Remove inward velocity, optionally preserving speed along the wall.
function resolveWallVelocity(velocityX: number, velocityZ: number, [normalX, normalZ]: [number, number], preserveSpeed: boolean): [number, number] {
    const horizontalSpeed = Math.hypot(velocityX, velocityZ);
    const inwardSpeed = Math.min(0, velocityX * normalX + velocityZ * normalZ);
    velocityX -= normalX * inwardSpeed; velocityZ -= normalZ * inwardSpeed;
    const projectedSpeed = Math.hypot(velocityX, velocityZ);
    if (preserveSpeed && projectedSpeed > 1e-6) {
        velocityX *= horizontalSpeed / projectedSpeed; velocityZ *= horizontalSpeed / projectedSpeed;
    }
    return [velocityX, velocityZ];
}

export function createParkourState(position: Position): ParkourState {
    return { position: [...position], velocityY: 0, velocity: [0, 0], grounded: false,
        crouched: false, wallNormal: null, wallTime: 0, climbRemaining: null, jumpBuffer: 0 };
}
export function stepParkour(state: ParkourState,
    input: { x: number; z: number; jump: boolean; crouch?: boolean; detach?: boolean; facingX?: number; facingZ?: number },
    settings: MovementSettings, world: Surface[] | SurfaceGrid, deltaTime: number): ParkourState {
    // Read input, stance, and wall contact
    const [x, y, z] = state.position;
    const clearanceReach = Math.SQRT2 * (PLAYER_RADIUS + 0.08) + 0.001;
    let surfaces = Array.isArray(world) ? world : world.query({
        minX: x - clearanceReach, maxX: x + clearanceReach,
        minY: y, maxY: y + STANDING_HEIGHT,
        minZ: z - clearanceReach, maxZ: z + clearanceReach,
    });
    const blockedStanding = state.crouched && surfaces.some(surface => overlaps(x, z, surface) && touchesHeight(y, STANDING_HEIGHT, surface));
    const crouched = !!input.crouch || blockedStanding;
    const height = crouched ? CROUCH_HEIGHT : STANDING_HEIGHT;
    const inputMagnitude = Math.hypot(input.x, input.z);
    const inputX = input.x / Math.max(1, inputMagnitude), inputZ = input.z / Math.max(1, inputMagnitude);
    let [velocityX, velocityZ] = state.velocity;
    let velocityY = state.velocityY;
    const facingX = input.facingX ?? inputX, facingZ = input.facingZ ?? inputZ;
    const previousWallContact = state.wallNormal && wallAt(x, y, z, height, surfaces, state.wallNormal);
    const wallContact = previousWallContact ?? wallAt(x, y, z, height, surfaces);
    const wallMovementEnabled = !state.grounded && !crouched && !input.detach;
    const movingForward = inputX * facingX + inputZ * facingZ > 1e-6;
    let jumpBuffer = input.jump ? JUMP_BUFFER : Math.max(0, state.jumpBuffer - deltaTime);
    // Nearby contact permits a jump only while we are not already moving away.
    const jumpWallNormal = wallMovementEnabled && wallContact && velocityX * wallContact[0] + velocityZ * wallContact[1] <= 1e-6 ? wallContact : null;
    const jumping = jumpBuffer > 0 && (state.grounded || !!jumpWallNormal);
    if (jumping) jumpBuffer = 0;
    const acceptsWall = (normal: [number, number]) => {
        if (!wallMovementEnabled || !movingForward || jumping) return false;
        // An established wallrun permits looking away; a climb releases outward.
        if (sameNormal(previousWallContact, normal) && state.climbRemaining === null) return true;
        return inputX * normal[0] + inputZ * normal[1] <= 0.1;
    };
    let wallNormal = wallContact && acceptsWall(wallContact) && (previousWallContact || jumpWallNormal) ? wallContact : null;

    const groundedMovement = state.grounded && !jumping;

    // Choose horizontal movement parameters
    let movementX = inputX, movementZ = inputZ;
    let targetSpeed = settings.speed;
    let acceleration = groundedMovement ? RUN_ACCELERATION : AIR_ACCELERATION;
    if (wallNormal) {
        [velocityX, velocityZ] = resolveWallVelocity(velocityX, velocityZ, wallNormal, !isWallClimbing(wallNormal, facingX, facingZ));
        const normalInput = movementX * wallNormal[0] + movementZ * wallNormal[1];
        movementX -= wallNormal[0] * normalInput; movementZ -= wallNormal[1] * normalInput;
        targetSpeed *= WALL_SPEED_MULTIPLIER;
        acceleration = RUN_ACCELERATION;
    }
    if (groundedMovement && crouched) {
        targetSpeed = Math.min(CROUCH_SPEED, targetSpeed);
        acceleration = CROUCH_ACCELERATION;
    }

    // Apply slide entry and ground friction
    let horizontalSpeed = Math.hypot(velocityX, velocityZ);
    if (state.grounded && crouched && !state.crouched && horizontalSpeed > CROUCH_SPEED) {
        const boost = Math.min(settings.slideBoost ?? DEFAULT_MOVEMENT_SETTINGS.slideBoost, Math.max(0, SLIDE_BOOST_SPEED_LIMIT - horizontalSpeed));
        velocityX += velocityX / horizontalSpeed * boost; velocityZ += velocityZ / horizontalSpeed * boost;
        horizontalSpeed += boost;
    }
    if (groundedMovement && horizontalSpeed > 0) {
        const speedDrop = crouched ? SLIDE_DECELERATION * deltaTime
            : Math.max(horizontalSpeed, STOP_SPEED) * GROUND_FRICTION * deltaTime;
        const speedScale = Math.max(0, horizontalSpeed - speedDrop) / horizontalSpeed;
        velocityX *= speedScale; velocityZ *= speedScale;
    }
    // Accelerate and steer horizontal movement
    const movementMagnitude = Math.hypot(movementX, movementZ);
    if (!groundedMovement && !wallNormal && movementMagnitude > 1e-6) {
        // Air input builds speed from rest, then steers carried momentum without adding energy.
        const targetVelocityX = movementX * targetSpeed, targetVelocityZ = movementZ * targetSpeed;
        if (horizontalSpeed < targetSpeed * movementMagnitude - 1e-6) {
            const velocityDeltaX = targetVelocityX - velocityX, velocityDeltaZ = targetVelocityZ - velocityZ;
            const accelerationFraction = Math.min(1, acceleration * deltaTime / Math.hypot(velocityDeltaX, velocityDeltaZ));
            velocityX += velocityDeltaX * accelerationFraction; velocityZ += velocityDeltaZ * accelerationFraction;
        }
        if (!(jumping && jumpWallNormal)) {
            const steeringAngle = Math.atan2(velocityX * movementZ - velocityZ * movementX,
                velocityX * movementX + velocityZ * movementZ);
            const turnAngle = steeringAngle * (1 - Math.exp(-AIR_TURN_RATE * deltaTime));
            const turnCos = Math.cos(turnAngle), turnSin = Math.sin(turnAngle);
            [velocityX, velocityZ] = [velocityX * turnCos - velocityZ * turnSin, velocityX * turnSin + velocityZ * turnCos];
        }
    } else if (movementMagnitude > 1e-6) {
        const directionX = movementX / movementMagnitude, directionZ = movementZ / movementMagnitude;
        const speedAlongInput = velocityX * directionX + velocityZ * directionZ;
        const addedSpeed = Math.max(0, Math.min(targetSpeed * movementMagnitude - speedAlongInput, acceleration * deltaTime));
        velocityX += directionX * addedSpeed; velocityZ += directionZ * addedSpeed;
    } else if (wallNormal && horizontalSpeed > 0) {
        // Facing straight into the wall brakes sideways motion during a climb.
        const speedScale = Math.max(0, horizontalSpeed - RUN_ACCELERATION * deltaTime) / horizontalSpeed;
        velocityX *= speedScale; velocityZ *= speedScale;
    }

    // Apply jump impulses
    if (jumping) {
        velocityY += jumpWallNormal ? WALL_JUMP_IMPULSE : settings.jumpSpeed;
        if (jumpWallNormal) {
            const climbing = isWallClimbing(jumpWallNormal, facingX, facingZ);
            [velocityX, velocityZ] = resolveWallVelocity(velocityX, velocityZ, jumpWallNormal, !climbing);
            if (!climbing) {
                const [normalX, normalZ] = jumpWallNormal;
                const tangentAlignment = -facingX * normalZ + facingZ * normalX;
                const outwardAlignment = facingX * normalX + facingZ * normalZ;
                const departureAngle = Math.max(WALLRUN_JUMP_MIN_ANGLE, Math.atan2(outwardAlignment, Math.abs(tangentAlignment)));
                const horizontalSpeed = Math.hypot(velocityX, velocityZ);
                const outwardSpeed = Math.sin(departureAngle) * horizontalSpeed + WALL_PUSH_IMPULSE;
                const tangentSpeed = Math.cos(departureAngle) * Math.sign(tangentAlignment) * horizontalSpeed;
                velocityX = normalX * outwardSpeed - normalZ * tangentSpeed;
                velocityZ = normalZ * outwardSpeed + normalX * tangentSpeed;
            }
        }
    }

    // Move horizontally and resolve collisions
    if (!Array.isArray(world)) {
        // Query the full travel radius to cover redirection along surfaces.
        const collisionPadding = 2 * PLAYER_RADIUS + 0.001;
        const sweepReach = Math.hypot(velocityX, velocityZ) * deltaTime + collisionPadding;
        const highestY = y + Math.max(0, velocityY) * deltaTime;
        surfaces = world.query({
            minX: x - sweepReach, maxX: x + sweepReach,
            minY: Math.min(y, y + (velocityY - GRAVITY * deltaTime) * deltaTime) - collisionPadding, maxY: highestY + STANDING_HEIGHT + collisionPadding,
            minZ: z - sweepReach, maxZ: z + sweepReach,
        });
    }
    // Sweep against expanded local boxes, selecting the earliest face across
    // all surfaces. Resolve velocity once and use it for the remaining tick.
    let nextX = x, nextZ = z;
    let remainingTime = deltaTime;
    for (let iteration = 0; iteration < 8; iteration++) {
        const remainingDistanceX = velocityX * remainingTime, remainingDistanceZ = velocityZ * remainingTime;
        const hit = sweepWall(nextX, y, nextZ, height, remainingDistanceX, remainingDistanceZ, surfaces);
        if (!hit) { nextX += remainingDistanceX; nextZ += remainingDistanceZ; break; }
        nextX += remainingDistanceX * hit.time; nextZ += remainingDistanceZ * hit.time;
        remainingTime *= 1 - hit.time;
        const attaching = uprightWall(hit.wall) && acceptsWall(hit.normal);
        [velocityX, velocityZ] = resolveWallVelocity(velocityX, velocityZ, hit.normal, attaching && !isWallClimbing(hit.normal, facingX, facingZ));
        if (attaching) wallNormal = hit.normal;
        if (Math.hypot(velocityX * remainingTime, velocityZ * remainingTime) < 1e-10) break;
    }

    // Apply wall support and vertical motion
    const continuingContact = sameNormal(state.wallNormal, wallNormal);
    const wallTime = continuingContact ? state.wallTime : 0;
    let climbRemaining = continuingContact ? state.climbRemaining : null;
    const climbing = isWallClimbing(wallNormal, facingX, facingZ);
    if (climbing && climbRemaining === null) climbRemaining = velocityY <= WALL_CLIMB_SPEED ? WALL_CLIMB_DURATION : 0;
    if (wallNormal && !continuingContact && !climbing) velocityY = 0;
    // Wallrun gravity increases with contact age; climbs provide timed upward acceleration.
    const gravityScale = wallNormal && !climbing ? Math.min(1, wallTime ** 3) : 1;
    velocityY -= GRAVITY * gravityScale * deltaTime;
    if (climbing && climbRemaining !== null && climbRemaining > 0) velocityY += Math.min(Math.max(0, WALL_CLIMB_SPEED - velocityY), RUN_ACCELERATION * deltaTime);
    if (climbRemaining !== null) climbRemaining = Math.max(0, climbRemaining - deltaTime);
    // Move vertically and resolve ceilings and landings
    let nextY = y + velocityY * deltaTime;
    if (velocityY > 0) for (const surface of surfaces) {
        if (surface.bottom !== undefined && overlaps(nextX, nextZ, surface) && y + height <= surface.bottom + 0.001 && nextY + height > surface.bottom) {
            nextY = Math.min(nextY, surface.bottom - height); velocityY = 0;
        }
    }
    let landingHeight: number | undefined;
    if (velocityY <= 0) for (const surface of surfaces) {
        const previousTop = surfaceTopAt(surface, x, z, PLAYER_RADIUS);
        const nextTop = surfaceTopAt(surface, nextX, nextZ, PLAYER_RADIUS);
        if (previousTop === null || nextTop === null || y < previousTop - 0.001) continue;
        const crossedTop = nextY <= nextTop;
        const followedSlope = state.grounded && Math.abs(y - previousTop) <= 0.01
            && nextTop <= y && y - nextTop <= 0.2;
        if ((crossedTop || followedSlope) && (landingHeight === undefined || nextTop > landingHeight)) landingHeight = nextTop;
    }
    if (landingHeight !== undefined) {
        nextY = landingHeight; velocityY = 0;
    }
    if (wallNormal && (landingHeight !== undefined || !wallAt(nextX, nextY, nextZ, height, surfaces, wallNormal))) wallNormal = null;
    // Return the resolved movement state
    return {
        position: [nextX, nextY, nextZ], velocity: [velocityX, velocityZ], velocityY,
        grounded: landingHeight !== undefined, crouched, wallNormal,
        wallTime: wallNormal ? wallTime + deltaTime : 0, climbRemaining: wallNormal ? climbRemaining : null, jumpBuffer,
    };
}

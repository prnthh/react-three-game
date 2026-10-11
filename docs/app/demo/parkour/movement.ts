import { type CollisionQueries, sameNormal, resolveWallVelocity, type Position } from './collision';

// Demo-owned kinematic movement against the static collision world.
export type ParkourState = {
    position: Position; velocityY: number; velocity: [number, number]; grounded: boolean;
    crouched: boolean;
    wallNormal: [number, number] | null;
    wallJumpAvailable: boolean;
    departedWall: [number, number] | null; // Prevent re-latching the departure contact margin.
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
const WALLRUN_JUMP_MIN_ANGLE = Math.PI / 6;
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

function wallJumpVelocity(velocityX: number, velocityZ: number, normal: [number, number], facingX: number, facingZ: number): [number, number] {
    const climbing = isWallClimbing(normal, facingX, facingZ);
    const velocity = resolveWallVelocity(velocityX, velocityZ, normal, !climbing);
    if (climbing) return velocity;
    const [nx, nz] = normal;
    const tangent = -facingX * nz + facingZ * nx;
    const outward = facingX * nx + facingZ * nz;
    const angle = Math.max(WALLRUN_JUMP_MIN_ANGLE, Math.atan2(outward, Math.abs(tangent)));
    const speed = Math.hypot(...velocity);
    const outwardSpeed = Math.sin(angle) * speed + WALL_PUSH_IMPULSE;
    const tangentSpeed = Math.cos(angle) * Math.sign(tangent) * speed;
    return [nx * outwardSpeed - nz * tangentSpeed, nz * outwardSpeed + nx * tangentSpeed];
}

export function createParkourState(position: Position): ParkourState {
    return { position: [...position], velocityY: 0, velocity: [0, 0], grounded: false,
        crouched: false, wallNormal: null, wallJumpAvailable: false, departedWall: null, wallTime: 0, climbRemaining: null, jumpBuffer: 0 };
}
export function stepParkour(state: ParkourState,
    input: { x: number; z: number; jump: boolean; crouch?: boolean; facingX?: number; facingZ?: number },
    settings: MovementSettings, world: CollisionQueries, deltaTime: number): ParkourState {
    // Read input, stance, and wall contact
    const crouched = !!input.crouch || (state.crouched && !world.canStand(state.position, STANDING_HEIGHT));
    const height = crouched ? CROUCH_HEIGHT : STANDING_HEIGHT;
    const inputMagnitude = Math.hypot(input.x, input.z);
    const inputX = input.x / Math.max(1, inputMagnitude), inputZ = input.z / Math.max(1, inputMagnitude);
    let [velocityX, velocityZ] = state.velocity;
    let velocityY = state.velocityY;
    const facingX = input.facingX ?? inputX, facingZ = input.facingZ ?? inputZ;
    // Forward input holds contact; releasing it ends this latch and its jump budget.
    const movingForward = inputX * facingX + inputZ * facingZ > 1e-6;
    const canLatch = movingForward && !state.grounded && !crouched;
    const wallContact = canLatch ? world.wallAt(state.position, height, state.wallNormal) : null;
    const previousWallContact = sameNormal(state.wallNormal, wallContact);
    const departedWall = !input.crouch && state.departedWall
        && sameNormal(world.wallAt(state.position, height, state.departedWall), state.departedWall) ? state.departedWall : null;
    const approachingWall = wallContact && velocityX * wallContact[0] + velocityZ * wallContact[1] <= 1e-6;
    let wallNormal = canLatch && wallContact && !sameNormal(departedWall, wallContact) && (previousWallContact || approachingWall) ? wallContact : null;
    let wallJumpAvailable = !!wallNormal && (!sameNormal(state.wallNormal, wallNormal) || state.wallJumpAvailable);
    let jumpBuffer = input.jump ? JUMP_BUFFER : Math.max(0, state.jumpBuffer - deltaTime);
    const jumping = jumpBuffer > 0 && (state.grounded || wallJumpAvailable);
    const jumpWallNormal = jumping ? wallNormal : null;
    const separating = !!jumpWallNormal && !isWallClimbing(jumpWallNormal, facingX, facingZ);
    if (jumping) { jumpBuffer = 0; wallJumpAvailable = false; }
    if (separating) wallNormal = null;
    const acceptsWall = (normal: [number, number]) => canLatch && !separating && !sameNormal(departedWall, normal);

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

    // Redirect wallrun momentum toward the camera, at least 30 degrees away from the wall.
    // A climb jump stays attached and spends the latch's single jump.
    if (jumping) {
        velocityY += jumpWallNormal ? WALL_JUMP_IMPULSE : settings.jumpSpeed;
        if (jumpWallNormal) {
            [velocityX, velocityZ] = wallJumpVelocity(velocityX, velocityZ, jumpWallNormal, facingX, facingZ);
        }
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
    const moved = world.move(state.position, height, [velocityX, velocityY, velocityZ], deltaTime, (normal, velocity) => {
        const attaching = acceptsWall(normal);
        if (attaching) {
            const climbing = isWallClimbing(normal, facingX, facingZ);
            if (!sameNormal(wallNormal, normal)) {
                wallJumpAvailable = true;
                if (!climbing) velocity[1] = 0;
            }
            wallNormal = normal;
        }
        const [vx, vz] = resolveWallVelocity(velocity[0], velocity[2], normal, attaching && !isWallClimbing(normal, facingX, facingZ));
        return [vx, velocity[1], vz];
    });
    const grounded = moved.grounded;
    [velocityX, velocityY, velocityZ] = moved.velocity;
    if (wallNormal && (grounded || !sameNormal(world.wallAt(moved.position, height, wallNormal), wallNormal))) wallNormal = null;
    // Return the resolved movement state
    return {
        position: moved.position, velocity: [velocityX, velocityZ], velocityY,
        grounded, crouched, wallNormal, wallJumpAvailable: !!wallNormal && wallJumpAvailable,
        departedWall: grounded ? null : separating ? jumpWallNormal : departedWall,
        wallTime: wallNormal ? wallTime + deltaTime : 0, climbRemaining: wallNormal ? climbRemaining : null, jumpBuffer,
    };
}

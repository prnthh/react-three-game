import { isWallClimbing } from './movement';

/** Turn inward wallrun aim toward the nearest tangent; outward aim and climbs stay free. */
export function wallrunYaw(yaw: number, normal: [number, number] | null, velocity: [number, number], deltaTime: number) {
    const facingX = -Math.sin(yaw), facingZ = -Math.cos(yaw);
    if (!normal || facingX * normal[0] + facingZ * normal[1] >= 0 || isWallClimbing(normal, facingX, facingZ)) return yaw;
    const tangentX = -normal[1], tangentZ = normal[0];
    const tangentSpeed = velocity[0] * tangentX + velocity[1] * tangentZ;
    if (Math.abs(tangentSpeed) < 0.5) return yaw;
    const tangentDirection = Math.sign(facingX * tangentX + facingZ * tangentZ);
    const targetYaw = Math.atan2(-tangentX * tangentDirection, -tangentZ * tangentDirection);
    const yawDifference = Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw));
    return yaw + yawDifference * (1 - Math.exp(-2 * deltaTime));
}

/** Camera-local lean away from the wall, fading to neutral when facing into it. */
export function cameraRoll(turnRate: number, wallNormal: [number, number] | null = null,
    facingX = 0, facingZ = -1) {
    const turnRoll = Math.max(-0.065, Math.min(0.065, turnRate * 0.018));
    const wallRoll = wallNormal ? (-facingZ * wallNormal[0] + facingX * wallNormal[1])
        * (isWallClimbing(wallNormal, facingX, facingZ) ? 0 : -0.12) : 0;
    return turnRoll + wallRoll;
}

export function cameraFov(speed: number) {
    const speedFraction = Math.max(0, Math.min(1, speed / 34));
    return 75 + 20 * speedFraction * speedFraction * (3 - 2 * speedFraction);
}


interface Point3 { x: number; y: number; z: number }

/** View-biased importance after frustum culling. Forward must be normalized. */
export function scoreLight(
    position: Point3,
    range: number,
    brightness: number,
    eye: Point3,
    forward: Point3,
): number {
    if (range <= 0 || brightness <= 0) return 0;
    const x = position.x - eye.x, y = position.y - eye.y, z = position.z - eye.z;
    const depth = x * forward.x + y * forward.y + z * forward.z;
    // Spherical-cap volume in front of the eye plane: smooth as lights cross it.
    // A light behind the eye can still illuminate visible surfaces within its range.
    const t = Math.max(0, Math.min(1, (depth + range) / (2 * range)));
    const visibleFraction = t * t * (3 - 2 * t);
    const influence = Math.min(1, range * range / Math.max(1, x * x + y * y + z * z));
    return brightness * influence * visibleFraction;
}

import { rigidBody, type RigidBody, type World } from "crashcat";

/** moveKinematic computes velocity but does not wake sleeping bodies. */
export function moveKinematicBody(world: World, body: RigidBody, position: [number, number, number], quaternion: [number, number, number, number], delta: number) {
    if (delta <= 0) return;
    rigidBody.moveKinematic(body, position, quaternion, delta);
    const { linearVelocity, angularVelocity } = body.motionProperties;
    if (linearVelocity.some(value => value !== 0) || angularVelocity.some(value => value !== 0)) {
        rigidBody.wake(world, body);
    }
}

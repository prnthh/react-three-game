import { kcc, MotionType, rigidBody, type RigidBody, type World } from "crashcat";
import { Quaternion, Vector3 } from "three";

type Character = ReturnType<typeof kcc.create>;

/** Carry by the platform's actual transform, then simulate movement relative to it. */
export function createPlatformSupport() {
    let body: RigidBody | null = null;
    const position = new Vector3();
    const rotation = new Quaternion();
    const offset = new Vector3();
    const deltaRotation = new Quaternion();
    const displacement = new Vector3();
    const target: [number, number, number] = [0, 0, 0];
    return {
        clear() { body = null; },
        get body() { return body; },
        listener: {
            onAdjustBodyVelocity(_character: Character, contactBody: RigidBody, linear: number[], angular: number[]) {
                if (contactBody !== body) return;
                // Its motion has already been applied by carry().
                linear.fill(0);
                angular.fill(0);
            },
        },
        carry(world: World, character: Character) {
            displacement.set(0, 0, 0);
            if (!body || rigidBody.get(world, body.id) !== body) {
                body = null;
                return displacement;
            }
            deltaRotation.fromArray(body.quaternion).multiply(rotation.invert());
            offset.fromArray(character.position).sub(position).applyQuaternion(deltaRotation);
            offset.x += body.position[0];
            offset.y += body.position[1];
            offset.z += body.position[2];
            displacement.set(offset.x - character.position[0], offset.y - character.position[1], offset.z - character.position[2]);
            offset.toArray(target);
            kcc.setPosition(world, character, target);
            position.fromArray(body.position);
            rotation.fromArray(body.quaternion);
            return displacement;
        },
        capture(world: World, character: Character) {
            const ground = kcc.isSupported(character) ? rigidBody.get(world, character.ground.bodyId) : null;
            body = ground?.motionType === MotionType.KINEMATIC ? ground : null;
            if (body) {
                position.fromArray(body.position);
                rotation.fromArray(body.quaternion);
            }
        },
    };
}

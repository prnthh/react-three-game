import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { ANIMATED_MODEL_COMPONENT, useGameObject } from "react-three-game/viewer";
import { Quaternion, Vector3 } from "three";
import { PLAYER_CENTER_Y, PLAYER_MODEL_ID, PLAYER_NODE_ID, type StagePoint } from "./stage";

const WALK_SPEED = 1.55;
const UP = new Vector3(0, 1, 0);

/** Move the authored player node; its model and physics body follow the same transform. */
export default function PlayerCharacter({ destination, spawn }: { destination: StagePoint | null; spawn: StagePoint }) {
    const playerObject = useGameObject(PLAYER_NODE_ID);
    const modelObject = useGameObject(PLAYER_MODEL_ID);
    const direction = useRef(new Vector3());
    const rotation = useRef(new Quaternion());

    useEffect(() => {
        const player = playerObject.transform;
        if (!player) return;
        player.position.set(spawn[0], spawn[1] + PLAYER_CENTER_Y, spawn[2]);
        player.rotation.set(0, 0.25, 0);
        player.updateMatrixWorld(true);
    }, [playerObject, spawn]);

    useFrame((_, delta) => {
        const player = playerObject.transform;
        if (!player) return;
        let walking = false;
        if (destination) {
            direction.current.set(destination[0] - player.position.x, 0, destination[2] - player.position.z);
            const distance = direction.current.length();
            walking = distance > 0.08;
            if (walking) {
                direction.current.normalize();
                rotation.current.setFromAxisAngle(UP, Math.atan2(direction.current.x, direction.current.z));
                player.quaternion.slerp(rotation.current, 1 - Math.exp(-14 * delta));
                player.position.addScaledVector(direction.current, Math.min(distance, WALK_SPEED * Math.min(delta, 0.1)));
            }
        }
        modelObject.getComponent(ANIMATED_MODEL_COMPONENT)?.setAnimationState(walking ? "walk" : "idle");
        player.updateMatrixWorld(true);
    }, -3);
    return null;
}

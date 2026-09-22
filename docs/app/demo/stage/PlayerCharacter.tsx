import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { ANIMATED_MODEL_COMPONENT, usePrefab, useSceneComponents } from "react-three-game/viewer";
import { Quaternion, Vector3 } from "three";
import { PLAYER_CENTER_Y, PLAYER_MODEL_ID, PLAYER_NODE_ID, type StagePoint } from "./stage";

const WALK_SPEED = 1.55;
const UP = new Vector3(0, 1, 0);

/** Move the authored player node; its model and physics body follow the same transform. */
export default function PlayerCharacter({ destination, spawn }: { destination: StagePoint | null; spawn: StagePoint }) {
    const prefab = usePrefab();
    const models = useSceneComponents(ANIMATED_MODEL_COMPONENT);
    const model = models.find(entry => entry.nodeId === PLAYER_MODEL_ID)?.value;
    const direction = useRef(new Vector3());
    const rotation = useRef(new Quaternion());

    useEffect(() => {
        const player = prefab.getObject(PLAYER_NODE_ID);
        if (!player) return;
        player.position.set(spawn[0], spawn[1] + PLAYER_CENTER_Y, spawn[2]);
        player.rotation.set(0, 0.25, 0);
        player.updateMatrixWorld(true);
    }, [prefab, spawn]);

    useFrame((_, delta) => {
        const player = prefab.getObject(PLAYER_NODE_ID);
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
        model?.setAnimationState(walking ? "walk" : "idle");
        player.updateMatrixWorld(true);
    }, -3);
    return null;
}

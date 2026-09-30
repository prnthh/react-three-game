import { useFrame } from "@react-three/fiber";
import { rigidBody } from "crashcat";
import { useEffect, useRef, useState } from "react";
import {
    PrefabEditorMode,
    useGameObject,
    useRegisterNodeComponent,
    useScene,
    type Component,
    type ComponentViewProps,
} from "react-three-game/viewer";
import { useCrashcat } from "react-three-game/plugins/crashcat";
import { Vector3 } from "three";

import { GRASS_WORLD_PLAYER_COMPONENT, type PlayerRuntime } from "./GrassWorldRuntime";

type BallInputProperties = {
    acceleration?: number;
    drag?: number;
    jumpVelocity?: number;
};

function BallInputView({ properties, children }: ComponentViewProps<BallInputProperties>) {
    const { id: runtimeNodeId } = useGameObject();
    const { mode } = useScene();
    const crashcat = useCrashcat();
    const keys = useRef(new Set<string>());
    const jumpRequested = useRef(false);
    const move = useRef(new Vector3());
    const bodyVelocity = useRef<[number, number, number]>([0, 0, 0]);
    const isPlayMode = mode === PrefabEditorMode.Play;

    useEffect(() => {
        if (!isPlayMode) {
            keys.current.clear();
            return;
        }
        const clear = () => { keys.current.clear(); jumpRequested.current = false; };
        const down = (event: KeyboardEvent) => {
            const target = event.target;
            if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, button'))) return;
            keys.current.add(event.code);
            if (event.code === "Space" && !event.repeat) jumpRequested.current = true;
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
            if (event.code === "KeyF" && !event.repeat) {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void document.documentElement.requestFullscreen();
            }
        };
        const up = (event: KeyboardEvent) => keys.current.delete(event.code);
        window.addEventListener("blur", clear);
        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        return () => {
            clear();
            window.removeEventListener("blur", clear);
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
        };
    }, [isPlayMode]);

    useFrame((_, delta) => {
        if (!isPlayMode || !crashcat) return;
        const body = crashcat.getBody(runtimeNodeId);
        if (!body) return;
        const dt = Math.min(delta, 0.1);
        const pressed = keys.current;
        const linearVelocity = body.motionProperties.linearVelocity;
        let velocityX = linearVelocity[0];
        let velocityY = linearVelocity[1];
        let velocityZ = linearVelocity[2];

        move.current.set(
            (pressed.has("KeyD") || pressed.has("ArrowRight") ? 1 : 0) - (pressed.has("KeyA") || pressed.has("ArrowLeft") ? 1 : 0),
            0,
            (pressed.has("KeyS") || pressed.has("ArrowDown") ? 1 : 0) - (pressed.has("KeyW") || pressed.has("ArrowUp") ? 1 : 0),
        );
        if (move.current.lengthSq() > 0) {
            move.current.normalize().multiplyScalar((properties.acceleration ?? 32) * dt);
            velocityX += move.current.x;
            velocityZ += move.current.z;
        }

        const drag = Math.exp(-(properties.drag ?? 1.8) * dt);
        velocityX *= drag;
        velocityZ *= drag;
        if (jumpRequested.current && body.contactCount > 0) velocityY = properties.jumpVelocity ?? 10.5;
        jumpRequested.current = false;

        bodyVelocity.current[0] = velocityX;
        bodyVelocity.current[1] = velocityY;
        bodyVelocity.current[2] = velocityZ;
        rigidBody.setLinearVelocity(crashcat.world, body, bodyVelocity.current);
    }, -2);

    return <>{children}</>;
}

export const BallInputComponent: Component<BallInputProperties> = {
    name: "GrassWorldBallInput",
    View: BallInputView,
    properties: {
        acceleration: { default: 32, min: 0, step: 1 },
        drag: { default: 1.8, min: 0, step: 0.1 },
        jumpVelocity: { default: 10.5, min: 0, step: 0.5 },
    },
};

function PlayerPositionSyncView({ children }: ComponentViewProps) {
    const objectRef = useGameObject();
    const [player] = useState<PlayerRuntime>(() => ({ position: new Vector3() }));

    useRegisterNodeComponent(GRASS_WORLD_PLAYER_COMPONENT, player);

    useFrame(() => {
        const ball = objectRef.transform;
        if (!ball) return;

        ball.getWorldPosition(player.position);
    }, -0.5);

    return <>{children}</>;
}

export const PlayerPositionSyncComponent: Component = {
    name: "GrassWorldPlayerPositionSync",
    View: PlayerPositionSyncView,
    properties: {},
};

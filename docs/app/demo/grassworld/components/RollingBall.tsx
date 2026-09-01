import { useFrame } from "@react-three/fiber";
import { rigidBody } from "crashcat";
import { useEffect, useRef, useState } from "react";
import {
    PrefabEditorMode,
    useNode,
    useNodeObject,
    usePrefab,
    useRegisterNodeComponent,
    useScene,
    type Component,
    type ComponentViewProps,
} from "react-three-game";
import { useCrashcat } from "react-three-game/plugins/crashcat";
import { Vector3 } from "three";

import { GRASS_WORLD_PLAYER_COMPONENT, type PlayerRuntime } from "./GrassWorldRuntime";

type BallInputProperties = {
    acceleration?: number;
    drag?: number;
    jumpVelocity?: number;
};

function BallInputView({ properties, children }: ComponentViewProps<BallInputProperties>) {
    const { runtimeNodeId } = useNode();
    const { mode } = useScene();
    const crashcat = useCrashcat();
    const keys = useRef(new Set<string>());
    const move = useRef(new Vector3());
    const bodyVelocity = useRef<[number, number, number]>([0, 0, 0]);
    const isPlayMode = mode === PrefabEditorMode.Play;

    useEffect(() => {
        if (!isPlayMode) {
            keys.current.clear();
            return;
        }
        const down = (event: KeyboardEvent) => {
            keys.current.add(event.code);
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
            if (event.code === "KeyF") {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void document.documentElement.requestFullscreen();
            }
        };
        const up = (event: KeyboardEvent) => keys.current.delete(event.code);
        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        return () => {
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
        };
    }, [isPlayMode]);

    useFrame((_, delta) => {
        if (!isPlayMode || !crashcat) return;
        const body = crashcat.getBody(runtimeNodeId);
        if (!body) return;
        const dt = Math.min(delta, 1 / 30);
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
        if (pressed.has("Space") && body.contactCount > 0) velocityY = properties.jumpVelocity ?? 10.5;

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
    const objectRef = useNodeObject();
    const { mode } = useScene();
    const [player] = useState<PlayerRuntime>(() => ({ position: new Vector3() }));
    const isPlayMode = mode === PrefabEditorMode.Play;

    useRegisterNodeComponent(GRASS_WORLD_PLAYER_COMPONENT, player);

    useFrame(() => {
        if (!isPlayMode) return;
        const ball = objectRef.current;
        if (!ball) return;

        ball.getWorldPosition(player.position);
    }, 0);

    return <>{children}</>;
}

export const PlayerPositionSyncComponent: Component = {
    name: "GrassWorldPlayerPositionSync",
    View: PlayerPositionSyncView,
    properties: {},
};

type CameraFollowProperties = {
    targetId?: string;
    positionOffset?: [number, number, number];
    targetOffset?: [number, number, number];
    followSpeed?: number;
};

function CameraFollowView({ properties, children }: ComponentViewProps<CameraFollowProperties>) {
    const cameraObjectRef = useNodeObject();
    const prefab = usePrefab();
    const { mode } = useScene();
    const targetPosition = useRef(new Vector3());
    const cameraWorldPosition = useRef(new Vector3());
    const desiredWorldPosition = useRef(new Vector3());
    const localPosition = useRef(new Vector3());
    const lookAtPosition = useRef(new Vector3());

    useFrame((_, delta) => {
        if (mode !== PrefabEditorMode.Play) return;
        const cameraObject = cameraObjectRef.current;
        const targetId = properties.targetId?.trim();
        const target = targetId ? prefab.getObject(targetId) : null;
        if (!cameraObject || !target) return;

        target.getWorldPosition(targetPosition.current);
        const positionOffset = properties.positionOffset ?? [0, 16, 20];
        desiredWorldPosition.current.set(positionOffset[0], positionOffset[1], positionOffset[2]).add(targetPosition.current);
        cameraObject.getWorldPosition(cameraWorldPosition.current);
        cameraWorldPosition.current.lerp(
            desiredWorldPosition.current,
            Math.min(1, (properties.followSpeed ?? 7.5) * Math.min(delta, 1 / 30)),
        );
        localPosition.current.copy(cameraWorldPosition.current);
        if (cameraObject.parent) cameraObject.parent.worldToLocal(localPosition.current);
        cameraObject.position.copy(localPosition.current);

        const targetOffset = properties.targetOffset ?? [0, 1, 0];
        lookAtPosition.current.set(targetOffset[0], targetOffset[1], targetOffset[2]).add(targetPosition.current);
        cameraObject.lookAt(lookAtPosition.current);
    }, 0);

    return <>{children}</>;
}

export const CameraFollowComponent: Component<CameraFollowProperties> = {
    name: "GrassWorldCameraFollow",
    View: CameraFollowView,
    properties: {
        targetId: { type: "string", default: "" },
        positionOffset: { type: "vector3", default: [0, 16, 20] },
        targetOffset: { type: "vector3", default: [0, 1, 0] },
        followSpeed: { default: 7.5, min: 0, step: 0.5 },
    },
};

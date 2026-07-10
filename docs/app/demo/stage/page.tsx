"use client";

import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrefabEditor, PrefabEditorMode } from "react-three-game/editor";
import stagePrefab from "../../../public/prefabs/stage.json";
import AnimationMixer from "../../viewer/components/AnimationMixer";
import SkinnedMesh, { type SkinnedMeshRef } from "../../viewer/components/SkinnedMesh";
import { BASE_PATH, withBasePath } from "../../basePath";
import { Quaternion, Vector3, type Group } from "three";
import type { AnimationAction } from "three";

const ONIMILIO_MODEL = withBasePath("/models/human/onimilio.glb");
const PLAYER_START: [number, number, number] = [-1.25, 0, -0.35];
const WALK_SPEED = 1.55;
const ARRIVAL_DISTANCE = 0.08;
const UP = new Vector3(0, 1, 0);

function findAnimationName(actionNames: string[], preferred: "idle" | "walk") {
    const normalized = actionNames.map((name) => ({ name, key: name.toLowerCase() }));

    if (preferred === "idle") {
        return normalized.find(({ key }) => key === "idle" || key.includes("idle"))?.name
            ?? actionNames[0];
    }

    return normalized.find(({ key }) => key === "walk" || key.includes("walk"))?.name
        ?? normalized.find(({ key }) => key.includes("run"))?.name
        ?? normalized.find(({ key }) => !key.includes("idle"))?.name
        ?? actionNames[0];
}

type StagePoint = [number, number, number];

function PlayerCharacter({ destination }: { destination: StagePoint | null }) {
    const playerRef = useRef<Group>(null);
    const skinnedMeshRef = useRef<SkinnedMeshRef>(null);
    const targetRef = useRef<Vector3 | null>(null);
    const scratchDirection = useRef(new Vector3());
    const scratchPosition = useRef(new Vector3());
    const targetQuaternion = useRef(new Quaternion());
    const [actionNames, setActionNames] = useState<string[]>([]);
    const [isWalking, setIsWalking] = useState(false);

    const animation = useMemo(() => {
        if (actionNames.length === 0) return undefined;
        return findAnimationName(actionNames, isWalking ? "walk" : "idle");
    }, [actionNames, isWalking]);

    useEffect(() => {
        if (!destination) return;

        targetRef.current = new Vector3(destination[0], PLAYER_START[1], destination[2]);
        setIsWalking(true);
    }, [destination]);

    const handleActions = useCallback((actions: Record<string, AnimationAction>) => {
        const nextNames = Object.keys(actions);
        setActionNames((currentNames) => {
            if (currentNames.length === nextNames.length && currentNames.every((name, index) => name === nextNames[index])) {
                return currentNames;
            }

            return nextNames;
        });
    }, []);

    useFrame((_, delta) => {
        const player = playerRef.current;
        const target = targetRef.current;
        if (!player || !target) return;

        const position = player.getWorldPosition(scratchPosition.current);
        const direction = scratchDirection.current.subVectors(target, position);
        direction.y = 0;

        const remaining = direction.length();
        if (remaining <= ARRIVAL_DISTANCE) {
            player.position.set(target.x, PLAYER_START[1], target.z);
            targetRef.current = null;
            setIsWalking(false);
            return;
        }

        direction.normalize();
        const yaw = Math.atan2(direction.x, direction.z);
        targetQuaternion.current.setFromAxisAngle(UP, yaw);
        player.quaternion.slerp(targetQuaternion.current, 1 - Math.exp(-14 * delta));

        const step = Math.min(remaining, WALK_SPEED * delta);
        player.position.x += direction.x * step;
        player.position.z += direction.z * step;
    });

    return (
        <group ref={playerRef} position={PLAYER_START} rotation={[0, 0.25, 0]} scale={[0.92, 0.92, 0.92]}>
            <SkinnedMesh ref={skinnedMeshRef} model={ONIMILIO_MODEL} />
            <AnimationMixer
                skinnedMeshRef={skinnedMeshRef}
                animation={animation}
                onActions={handleActions}
            />
        </group>
    );
}

export default function StageDemo() {
    const rightCharacterRef = useRef<SkinnedMeshRef>(null);
    const [playerDestination, setPlayerDestination] = useState<StagePoint | null>(null);

    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <PrefabEditor
                basePath={BASE_PATH}
                initialPrefab={stagePrefab}
                mode={PrefabEditorMode.Play}
                onPointerEvent={(eventType, event, node) => {
                    if (eventType === "click" && node.id == "stage-floor") {
                        setPlayerDestination([event.point.x, event.point.y, event.point.z]);
                    }
                }}
            >
                <PlayerCharacter destination={playerDestination} />

                <group position={[1.25, 0, -0.2]} rotation={[0, -0.25, 0]} scale={[0.92, 0.92, 0.92]}>
                    <SkinnedMesh ref={rightCharacterRef} model={ONIMILIO_MODEL} />
                    <AnimationMixer skinnedMeshRef={rightCharacterRef} />
                </group>
            </PrefabEditor>
        </main>
    );
}

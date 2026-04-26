"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { PrefabEditor, registerComponent, useScene } from "react-three-game";
import initialWorld from "../../samples/killbox.json";
import type { Prefab, PrefabEditorRef } from "react-three-game";
import { CrashcatRuntime } from "@/app/components/CrashcatRuntime";
import CrashcatPhysicsComponent from "@/app/components/CrashcatPhysicsComponent";
import FirstPersonPlayer from "./FirstPersonPlayer";

const ORB_SPEED = 1.2;
const WORLD_BOUNDARY = 8;

const ORB_IDS = ["orb1", "orb2"] as const;

registerComponent(CrashcatPhysicsComponent);

type Position3 = [number, number, number];
type OrbVelocity = { x: number; z: number };
type OrbId = typeof ORB_IDS[number];

function clampToWorldBounds(value: number) {
    return Math.max(-WORLD_BOUNDARY, Math.min(WORLD_BOUNDARY, value));
}

function getNextOrbPosition(position: Position3, velocity: OrbVelocity, delta: number): Position3 {
    const [x, y, z] = position;

    return [
        clampToWorldBounds(x + velocity.x * ORB_SPEED * delta),
        y,
        clampToWorldBounds(z + velocity.z * ORB_SPEED * delta),
    ];
}

export default function Home() {
    const editorRef = useRef<PrefabEditorRef>(null);

    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <PrefabEditor ref={editorRef} initialPrefab={initialWorld as Prefab}>
                <CrashcatRuntime debug>
                    <FirstPersonPlayer nodeId="player" />
                    <OrbAnimator />
                </CrashcatRuntime>
            </PrefabEditor>
        </main>
    );
}

function OrbAnimator() {
    const scene = useScene();
    const velocities = useRef<Record<OrbId, OrbVelocity>>({
        orb1: { x: 0, z: 0 },
        orb2: { x: 0, z: 0 },
    });
    const lastVelocityChange = useRef(0);

    useFrame((state, delta) => {
        const time = state.clock.getElapsedTime();
        if (time - lastVelocityChange.current > 1 + Math.random()) {
            lastVelocityChange.current = time;
            velocities.current = {
                orb1: { x: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 2 },
                orb2: { x: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 2 },
            };
        }

        ORB_IDS.forEach((orbId) => {
            const orb = scene.getObject(orbId);
            if (!orb) return;

            const position = [orb.position.x, orb.position.y, orb.position.z] as Position3;
            const nextPosition = getNextOrbPosition(position, velocities.current[orbId], delta);
            orb.position.set(nextPosition[0], nextPosition[1], nextPosition[2]);
            orb.updateMatrixWorld();
        });
    });

    return null;
}
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { PrefabEditor, registerComponent } from "react-three-game";
import initialWorld from "./world-demo.json";
import type { EntityComponent, Prefab, PrefabEditorRef } from "react-three-game";
import FirstPersonPlayer from "./FirstPersonPlayer";

const ORB_SPEED = 1.2;
const WORLD_BOUNDARY = 8;
const ORB_IDS = ["player1", "player2"] as const;

registerComponent(FirstPersonPlayer);

type Position3 = [number, number, number];
type TransformProperties = { position?: Position3 };
type OrbVelocity = { x: number; z: number };
type OrbId = typeof ORB_IDS[number];

function getPosition(transform: EntityComponent<TransformProperties>): Position3 | null {
    const position = transform.get<Position3>("position");

    if (!Array.isArray(position) || position.length !== 3) {
        return null;
    }

    return position as Position3;
}

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
                <OrbAnimator editorRef={editorRef} />
            </PrefabEditor>
        </main>
    );
}

function OrbAnimator({ editorRef }: { editorRef: React.RefObject<PrefabEditorRef | null> }) {
    const velocities = useRef<Record<OrbId, OrbVelocity>>({
        player1: { x: 0, z: 0 },
        player2: { x: 0, z: 0 },
    });
    const lastVelocityChange = useRef(0);

    useFrame((state, delta) => {
        if (!editorRef.current) {
            return;
        }

        const time = state.clock.getElapsedTime();

        if (time - lastVelocityChange.current > 1 + Math.random()) {
            lastVelocityChange.current = time;
            velocities.current.player1 = {
                x: (Math.random() - 0.5) * 2,
                z: (Math.random() - 0.5) * 2,
            };
            velocities.current.player2 = {
                x: (Math.random() - 0.5) * 2,
                z: (Math.random() - 0.5) * 2,
            };
        }

        for (const orbId of ORB_IDS) {
            const transform = editorRef.current.scene.find(orbId)?.getComponent<TransformProperties>("Transform");
            if (!transform) {
                continue;
            }

            const position = getPosition(transform);
            if (!position) {
                continue;
            }

            transform.set("position", getNextOrbPosition(position, velocities.current[orbId], delta));
        }
    });

    return null;
}
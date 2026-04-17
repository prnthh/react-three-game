"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { PrefabEditor, registerComponent } from "react-three-game";
import initialWorld from "../../samples/killbox.json";
import type { Prefab, PrefabEditorRef } from "react-three-game";
import FirstPersonPlayer from "./FirstPersonPlayer";

const ORB_SPEED = 1.2;
const WORLD_BOUNDARY = 8;

const ORB_IDS = ["orb1", "orb2"] as const;

registerComponent(FirstPersonPlayer);

type Position3 = [number, number, number];
type TransformProperties = { position?: Position3 };
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
                <OrbAnimator editorRef={editorRef} />
            </PrefabEditor>
        </main>
    );
}

function OrbAnimator({ editorRef }: { editorRef: React.RefObject<PrefabEditorRef | null> }) {
    const velocities = useRef<Record<OrbId, OrbVelocity>>({
        orb1: { x: 0, z: 0 },
        orb2: { x: 0, z: 0 },
    });
    const lastVelocityChange = useRef(0);

    useFrame((state, delta) => {
        const scene = editorRef.current?.scene;
        if (!scene) return;

        const time = state.clock.getElapsedTime();
        if (time - lastVelocityChange.current > 1 + Math.random()) {
            lastVelocityChange.current = time;
            velocities.current = {
                orb1: { x: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 2 },
                orb2: { x: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 2 },
            };
        }

        // This demo intentionally uses the authored Scene API path rather than
        // a runtime lifecycle component so it demonstrates the two surfaces separately.
        scene.batch(() => {
            for (const orbId of ORB_IDS) {
                scene.find(orbId)?.getComponent<TransformProperties>("Transform")?.update((properties) => {
                    const position = Array.isArray(properties.position) && properties.position.length === 3
                        ? properties.position as Position3
                        : null;

                    if (!position) {
                        return properties;
                    }

                    return {
                        ...properties,
                        position: getNextOrbPosition(position, velocities.current[orbId], delta),
                    };
                });
            }
        });
    });

    return null;
}
"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { PrefabEditor } from "react-three-game";
import initialWorld from "./world-demo.json";
import type { EntityComponent, Prefab, PrefabEditorRef } from "react-three-game";

const PLAYER_SPEED = 1.2;
const WORLD_BOUNDARY = 8;
const PLAYER_IDS = ["player1", "player2"] as const;

type PlayerVelocity = { x: number; z: number };
type Position3 = [number, number, number];
type TransformProperties = { position?: Position3 };
type PlayerId = typeof PLAYER_IDS[number];

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

function getNextPlayerPosition(position: Position3, velocity: PlayerVelocity, delta: number): Position3 {
    const [x, y, z] = position;

    return [
        clampToWorldBounds(x + velocity.x * PLAYER_SPEED * delta),
        y,
        clampToWorldBounds(z + velocity.z * PLAYER_SPEED * delta),
    ];
}

// Component that handles the animation loop (runs inside the editor's Canvas)
function PlayerAnimator({ editorRef }: { editorRef: React.RefObject<PrefabEditorRef | null> }) {
    // Store velocity for each player for smooth random movement
    const velocities = useRef({
        player1: { x: 0, z: 0 },
        player2: { x: 0, z: 0 },
    });

    // Time tracking for velocity changes
    const lastVelocityChange = useRef(0);

    useFrame((state, delta) => {
        if (!editorRef.current) return;

        const time = state.clock.getElapsedTime();

        // Change velocities every 1-2 seconds
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

        for (const playerId of PLAYER_IDS) {
            const transform = editorRef.current.scene.find(playerId)?.getComponent<TransformProperties>("Transform");
            if (!transform) {
                continue;
            }

            const position = getPosition(transform);
            if (!position) {
                continue;
            }

            transform.set("position", getNextPlayerPosition(position, velocities.current[playerId as PlayerId], delta));
        }
    });

    return null;
}

export default function Home() {
    const editorRef = useRef<PrefabEditorRef>(null);

    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <PrefabEditor ref={editorRef} initialPrefab={initialWorld as Prefab}>
                <PlayerAnimator editorRef={editorRef} />
            </PrefabEditor>
        </main>
    );
}

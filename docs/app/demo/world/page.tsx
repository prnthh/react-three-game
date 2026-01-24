"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { PrefabEditor, updateNodeById } from "react-three-game";
import initialWorld from "../../samples/world-demo.json";
import type { Prefab, PrefabEditorRef } from "react-three-game";

// Component that handles the animation loop (runs inside the editor's Canvas)
function PlayerAnimator({ editorRef }: { editorRef: React.RefObject<PrefabEditorRef | null> }) {
    // Store velocity for each player for smooth random movement
    const velocities = useRef({
        player1: { x: 0, z: 0 },
        player2: { x: 0, z: 0 },
    });

    // Time tracking for velocity changes
    const lastVelocityChange = useRef(0);

    useFrame((state) => {
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

        // Update player positions via the editor ref
        const currentPrefab = editorRef.current.prefab;
        let newRoot = currentPrefab.root;

        // Update player1
        newRoot = updateNodeById(newRoot, "player1", (node) => {
            const transform = node.components?.transform?.properties;
            if (!transform) return node;

            const pos = transform.position as [number, number, number];
            let newX = pos[0] + velocities.current.player1.x * 0.02;
            let newZ = pos[2] + velocities.current.player1.z * 0.02;

            // Keep within bounds
            newX = Math.max(-8, Math.min(8, newX));
            newZ = Math.max(-8, Math.min(8, newZ));

            return {
                ...node,
                components: {
                    ...node.components,
                    transform: {
                        ...node.components!.transform!,
                        properties: {
                            ...transform,
                            position: [newX, pos[1], newZ],
                        },
                    },
                },
            };
        });

        // Update player2
        newRoot = updateNodeById(newRoot, "player2", (node) => {
            const transform = node.components?.transform?.properties;
            if (!transform) return node;

            const pos = transform.position as [number, number, number];
            let newX = pos[0] + velocities.current.player2.x * 0.02;
            let newZ = pos[2] + velocities.current.player2.z * 0.02;

            // Keep within bounds
            newX = Math.max(-8, Math.min(8, newX));
            newZ = Math.max(-8, Math.min(8, newZ));

            return {
                ...node,
                components: {
                    ...node.components,
                    transform: {
                        ...node.components!.transform!,
                        properties: {
                            ...transform,
                            position: [newX, pos[1], newZ],
                        },
                    },
                },
            };
        });

        // Only update if something changed
        if (newRoot !== currentPrefab.root) {
            editorRef.current.setPrefab({ ...currentPrefab, root: newRoot });
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

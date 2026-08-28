"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrefabEditorMode, registerComponent, type Prefab } from "react-three-game";
import { PrefabEditor, type PrefabEditorRef } from "react-three-game/editor";
import { CrashcatPhysicsComponent, CrashcatRuntime } from "react-three-game/plugins/crashcat";
import initialWorld from "../../../public/prefabs/game-level.json";

import PrefabSelector from "../../components/PrefabSelector";
import FirstPersonPlayer, { type FirstPersonPlayerRef } from "./components/FirstPersonPlayer";
import ElevatorMover from "./components/ElevatorMover";
import OrbMover from "./components/OrbMover";
import NPCPool, { type NPCPoolRef } from "./components/NPCPool";
import { BASE_PATH } from "../../basePath";

registerComponent(CrashcatPhysicsComponent);
registerComponent(ElevatorMover);
registerComponent(OrbMover);

const WEAPONS = [
    { name: "Crowbar", range: 2.5 },
    { name: "Pistol", range: 35 },
    { name: "Sniper", range: 120 },
] as const;

export default function Home() {
    const editorRef = useRef<PrefabEditorRef>(null);
    const playerRef = useRef<FirstPersonPlayerRef>(null);
    const npcPoolRef = useRef<NPCPoolRef>(null);
    const [selectedPrefab, setSelectedPrefab] = useState<Prefab>(initialWorld as unknown as Prefab);
    const [selectedPrefabName, setSelectedPrefabName] = useState("game-level");
    const [selectedWeaponIndex, setSelectedWeaponIndex] = useState(0);
    const weaponWheelTimeRef = useRef(0);
    const crosshairRef = useRef<HTMLDivElement>(null);
    const updateCrosshair = useCallback((canHit: boolean) => {
        if (crosshairRef.current) crosshairRef.current.style.color = canHit ? "#ef4444" : "#ffffff";
    }, []);
    const playerSpawn: [number, number, number] = selectedPrefabName === "game-level"
        ? [0, -3.15, 3]
        : [0, 1.3, 6];
    const selectedWeapon = WEAPONS[selectedWeaponIndex];

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.repeat) return;
            if (event.code === "Digit1") setSelectedWeaponIndex(0);
            if (event.code === "Digit2") setSelectedWeaponIndex(1);
            if (event.code === "Digit3") setSelectedWeaponIndex(2);
        };
        const handleWheel = (event: WheelEvent) => {
            const now = performance.now();
            if (Math.abs(event.deltaY) < 1 || now - weaponWheelTimeRef.current < 120) return;
            weaponWheelTimeRef.current = now;
            const direction = event.deltaY > 0 ? 1 : -1;
            setSelectedWeaponIndex(current => (current + direction + WEAPONS.length) % WEAPONS.length);
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("wheel", handleWheel, { passive: true });
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("wheel", handleWheel);
        };
    }, []);

    return (
        <main className="flex h-screen w-screen flex-col items-center justify-between bg-white dark:bg-black sm:items-start">
            <PrefabEditor
                ref={editorRef}
                basePath={BASE_PATH}
                prefab={selectedPrefab}
                mode={PrefabEditorMode.Play}
            >
                <CrashcatRuntime debug>
                    <FirstPersonPlayer
                        key={selectedPrefabName}
                        ref={playerRef}
                        spawnPosition={playerSpawn}
                        npcPoolRef={npcPoolRef}
                        targetDistance={selectedWeapon.range}
                        onAimTargetChange={updateCrosshair}
                    />
                    {selectedPrefabName === "game-level" && (
                        <NPCPool ref={npcPoolRef} playerRef={playerRef} debug />
                    )}
                </CrashcatRuntime>
            </PrefabEditor>
            <div
                ref={crosshairRef}
                aria-hidden="true"
                className="pointer-events-none fixed left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 select-none font-mono text-3xl font-bold leading-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
            >
                +
            </div>
            <div
                aria-live="polite"
                className="pointer-events-none fixed right-4 top-4 z-10 select-none rounded border border-white/40 bg-black/55 px-4 py-2 font-mono text-sm uppercase tracking-[0.18em] text-white shadow-lg backdrop-blur-sm"
            >
                {selectedWeapon.name}
            </div>
            <div className="fixed top-2 left-1/2 -translate-x-1/2 z-2">
                <PrefabSelector
                    selectedName={selectedPrefabName}
                    onSelect={(prefab: Prefab, prefabName) => {
                        setSelectedPrefab(prefab);
                        setSelectedPrefabName(prefabName);
                    }}
                />
            </div>
        </main>
    );
}

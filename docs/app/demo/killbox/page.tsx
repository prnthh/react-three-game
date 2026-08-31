"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrefabEditorMode, registerComponent, useSceneComponents, type GameObject, type Prefab } from "react-three-game";
import { PrefabEditor, type PrefabEditorRef } from "react-three-game/editor";
import { CrashcatPhysicsComponent, CrashcatRuntime } from "react-three-game/plugins/crashcat";
import initialWorld from "../../../public/prefabs/street.json";

import PrefabSelector from "../../components/PrefabSelector";
import {
    PlayerControllerComponent,
    PlayerRuntime,
} from "./components/FirstPersonPlayer";
import ElevatorMover from "./components/ElevatorMover";
import OrbMover from "./components/OrbMover";
import { NPC_MANAGER_COMPONENT, NPCManagerComponent } from "./components/NPCManager";
import { BASE_PATH } from "../../basePath";

registerComponent(CrashcatPhysicsComponent);
registerComponent(ElevatorMover);
registerComponent(OrbMover);
registerComponent(NPCManagerComponent);
registerComponent(PlayerControllerComponent);

const PLAYER_PREFAB_URL = "/prefabs/player.json";
const PLAYER_SPAWN_ID = "killbox-player-spawn";

function containsPlayer(node: GameObject): boolean {
    if (node.id === PLAYER_SPAWN_ID) return true;
    for (const component of Object.values(node.components ?? {})) {
        if (component?.type === "KillboxPlayer") return true;
        if (component?.type === "PrefabRef" && component.properties.url === PLAYER_PREFAB_URL) return true;
    }
    return node.children?.some(containsPlayer) ?? false;
}

function injectPlayer(prefab: Prefab, prefabName: string): Prefab {
    if (containsPlayer(prefab.root)) return prefab;
    const position: [number, number, number] = prefabName === "game-level"
        ? [0, -3.15, 3]
        : [0, 1.3, 6];
    return {
        ...prefab,
        root: {
            ...prefab.root,
            children: [
                ...(prefab.root.children ?? []),
                {
                    id: PLAYER_SPAWN_ID,
                    name: "Player Spawn",
                    components: {
                        transform: { type: "Transform", properties: { position } },
                        prefab: { type: "PrefabRef", properties: { url: PLAYER_PREFAB_URL } },
                    },
                },
            ],
        },
    };
}

const WEAPONS = [
    { name: "Crowbar", range: 2.5 },
    { name: "Pistol", range: 35 },
    { name: "Sniper", range: 120 },
] as const;

const GAME_CANVAS_ID = "killbox-game-canvas";

function KillboxPlayerRuntime({
    targetDistance,
    onAimTargetChange,
}: {
    targetDistance: number;
    onAimTargetChange: (canHit: boolean) => void;
}) {
    const managers = useSceneComponents(NPC_MANAGER_COMPONENT);
    return <PlayerRuntime
        npcManager={managers[0]?.value}
        targetDistance={targetDistance}
        onAimTargetChange={onAimTargetChange}
        pointerLockSelector={`#${GAME_CANVAS_ID}`}
    />;
}

export default function Home() {
    const editorRef = useRef<PrefabEditorRef>(null);
    const [selectedPrefab, setSelectedPrefab] = useState<Prefab>(() => injectPlayer(initialWorld as unknown as Prefab, "street"));
    const [selectedPrefabName, setSelectedPrefabName] = useState("street");
    const [selectedWeaponIndex, setSelectedWeaponIndex] = useState(0);
    const weaponWheelTimeRef = useRef(0);
    const crosshairRef = useRef<HTMLDivElement>(null);
    const updateCrosshair = useCallback((canHit: boolean) => {
        if (crosshairRef.current) crosshairRef.current.style.color = canHit ? "#ef4444" : "#ffffff";
    }, []);
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
                mode={PrefabEditorMode.Edit}
                canvasProps={{ id: GAME_CANVAS_ID }}
            >
                <CrashcatRuntime>
                    <KillboxPlayerRuntime
                        key={`player-${selectedPrefabName}`}
                        targetDistance={selectedWeapon.range}
                        onAimTargetChange={updateCrosshair}
                    />
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
            <div className="fixed bottom-4 right-4 z-20">
                <PrefabSelector
                    selectedName={selectedPrefabName}
                    onSelect={(prefab: Prefab, prefabName) => {
                        setSelectedPrefab(injectPlayer(prefab, prefabName));
                        setSelectedPrefabName(prefabName);
                    }}
                />
            </div>
        </main>
    );
}

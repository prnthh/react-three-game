"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    AdditiveBlending,
    Quaternion,
    Vector3,
} from "three";
import {
    gameEvents,
    PrefabEditorMode,
    PrefabRoot,
    registerComponent,
    soundManager,
    type Prefab,
} from "react-three-game";
import { PrefabEditor } from "react-three-game/editor";
import { CrashcatPhysicsComponent, CrashcatRuntime } from "react-three-game/plugins/crashcat";

import AdvancingTargetComponent from "./AdvancingTargetComponent";
import IndustrialMachineGunComponent, { MACHINEGUN_PROJECTILE_ID_PREFIX } from "./IndustrialMachineGunComponent";
import { withBasePath, BASE_PATH } from "../../basePath";

import outdoorLevelPrefab from "../../../public/prefabs/machinegun-level-outdoor.json";
import ridgeLevelPrefab from "../../../public/prefabs/machinegun-level-ridge.json";
import causewayLevelPrefab from "../../../public/prefabs/machinegun-level-causeway.json";
import mechsuitPrefab from "../../../public/prefabs/industrial-machinegun-mechsuit.json";

const SHOT_EVENT = "machinegun:shot";
const TRIGGER_EVENT = "machinegun:trigger";
const PROJECTILE_COUNT_EVENT = "machinegun:projectiles";
const TARGET_HIT_EVENT = "target:hit";
const TARGET_BREACH_EVENT = "target:breach";
const TARGET_HIT_SOUNDS = ["/sound/hit.mp3", "/sound/hit2.mp3"];

type Vec3 = [number, number, number];

type AtmosphereConfig = {
    background: string;
    fogColor: string;
    fogNear: number;
    fogFar: number;
};

type LevelData = {
    label: string;
    roundNumber: number;
    totalRounds: number;
    hitGoal: number;
    atmosphere: AtmosphereConfig;
};

type LevelDefinition = {
    prefab: Prefab;
    data: LevelData;
};

type CombatStats = {
    rounds: number;
    hits: number;
    breaches: number;
    firing: boolean;
    roundHits: number;
    liveRounds: number;
    spawnSamples: number;
    averageSpawnMs: number;
};

const LEVEL_PREFABS = [
    outdoorLevelPrefab,
    ridgeLevelPrefab,
    causewayLevelPrefab,
] as unknown as Prefab[];

const MECHSUIT_PREFAB = mechsuitPrefab as unknown as Prefab;
const DEFAULT_ATMOSPHERE: AtmosphereConfig = {
    background: "#9ed4ff",
    fogColor: "#9ed4ff",
    fogNear: 56,
    fogFar: 165,
};

function readLevelData(prefab: Prefab, index: number): LevelData {
    const data = prefab.root.components?.data?.properties?.data as Partial<LevelData> | undefined;
    const atmosphere = data?.atmosphere ?? DEFAULT_ATMOSPHERE;

    return {
        label: data?.label ?? prefab.name ?? "Machinegun Level",
        roundNumber: data?.roundNumber ?? index + 1,
        totalRounds: data?.totalRounds ?? LEVEL_PREFABS.length,
        hitGoal: data?.hitGoal ?? 12,
        atmosphere,
    };
}

const LEVELS: LevelDefinition[] = LEVEL_PREFABS.map((prefab, index) => ({
    prefab,
    data: readLevelData(prefab, index),
}));

function createInitialStats(): CombatStats {
    return {
        rounds: 0,
        hits: 0,
        breaches: 0,
        firing: false,
        roundHits: 0,
        liveRounds: 0,
        spawnSamples: 0,
        averageSpawnMs: 0,
    };
}

function readNumber(value: unknown) {
    return typeof value === "number" ? value : undefined;
}

type ShotFx = {
    id: string;
    age: number;
    lifetime: number;
    position: Vec3;
    direction: Vec3;
};

function SceneAtmosphere({ atmosphere }: { atmosphere: AtmosphereConfig }) {
    return (
        <>
            <color attach="background" args={[atmosphere.background]} />
            <fog attach="fog" args={[atmosphere.fogColor, atmosphere.fogNear, atmosphere.fogFar]} />
        </>
    );
}

function ShotTracer({ shot }: { shot: ShotFx }) {
    const pose = useMemo(() => {
        const direction = new Vector3(...shot.direction).normalize();
        const position = new Vector3(...shot.position).addScaledVector(direction, 1.35);
        const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction);

        return { position, quaternion };
    }, [shot.direction, shot.position]);
    const alpha = Math.max(0, 1 - shot.age / shot.lifetime);

    return (
        <group>
            <mesh position={shot.position}>
                <sphereGeometry args={[0.18, 12, 8]} />
                <meshBasicMaterial
                    color="#fff4b8"
                    transparent
                    opacity={alpha}
                    blending={AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                />
            </mesh>
            <mesh position={pose.position} quaternion={pose.quaternion}>
                <cylinderGeometry args={[0.035, 0.012, 2.7, 8]} />
                <meshBasicMaterial
                    color="#ffe08a"
                    transparent
                    opacity={alpha * 0.82}
                    blending={AdditiveBlending}
                    depthWrite={false}
                    toneMapped={false}
                />
            </mesh>
        </group>
    );
}

function BattlefieldEffects() {
    const [shots, setShots] = useState<ShotFx[]>([]);

    useEffect(() => {
        return gameEvents.on(SHOT_EVENT, (payload: unknown) => {
            const detail = payload as { spawnPosition?: Vec3; direction?: Vec3 } | null;
            const spawnPosition = detail?.spawnPosition;
            const direction = detail?.direction;
            if (!spawnPosition || !direction) return;

            setShots((current) => [
                ...current.slice(-22),
                {
                    id: crypto.randomUUID(),
                    age: 0,
                    lifetime: 0.13,
                    position: spawnPosition,
                    direction,
                },
            ]);
        });
    }, []);

    useFrame((_, delta) => {
        setShots((current) => current
            .map((shot) => ({ ...shot, age: shot.age + delta }))
            .filter((shot) => shot.age < shot.lifetime));
    });

    return (
        <>
            {shots.map((shot) => <ShotTracer key={shot.id} shot={shot} />)}
        </>
    );
}

function BattlefieldStatus({ stats }: { stats: CombatStats }) {
    return (
        <Html position={[-7, 4, -4]} transform occlude={false}>
            <div
                style={{
                    minWidth: 156,
                    border: "1px solid rgba(226, 232, 240, 0.34)",
                    background: "rgba(15, 23, 42, 0.78)",
                    color: "#e2e8f0",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: 12,
                    lineHeight: 1.55,
                    padding: "10px 12px",
                    letterSpacing: 0,
                    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.32)",
                    pointerEvents: "none",
                }}
            >
                <div style={{ color: stats.firing ? "#fbbf24" : "#93c5fd", fontWeight: 700 }}>
                    {stats.firing ? "FIRING" : "ARMED"}
                </div>
                <div>ROUNDS {stats.rounds.toString().padStart(4, "0")}</div>
                <div>LIVE {stats.liveRounds.toString().padStart(4, "0")}</div>
                <div>SPAWN {stats.averageSpawnMs.toFixed(2)}MS</div>
                <div>HITS {stats.hits.toString().padStart(4, "0")}</div>
                <div>BREACHES {stats.breaches.toString().padStart(2, "0")}</div>
            </div>
        </Html>
    );
}

function RoundHud({ level, stats }: { level: LevelData; stats: CombatStats }) {
    const clear = stats.roundHits >= level.hitGoal;
    const hitText = `${Math.min(stats.roundHits, level.hitGoal).toString().padStart(2, "0")} / ${level.hitGoal.toString().padStart(2, "0")}`;

    return (
        <Html position={[0, 10, -15]} transform occlude={false}>
            <div
                style={{
                    minWidth: 230,
                    border: "1px solid rgba(147, 197, 253, 0.62)",
                    background: "rgba(8, 13, 22, 0.72)",
                    color: "#dbeafe",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    fontSize: 13,
                    lineHeight: 1.4,
                    letterSpacing: 0,
                    padding: "7px 12px",
                    textAlign: "center",
                    boxShadow: "0 0 22px rgba(125, 211, 252, 0.22)",
                    pointerEvents: "none",
                }}
            >
                <div style={{ fontWeight: 800, color: clear ? "#fbbf24" : "#bfdbfe" }}>
                    ROUND {level.roundNumber} / {level.totalRounds}
                </div>
                <div style={{ fontSize: 11, color: "#93c5fd" }}>{level.label}</div>
                <div style={{ fontSize: 11, color: clear ? "#fef3c7" : "#cbd5e1" }}>
                    {clear ? "CLEAR" : "TARGETS"} {hitText}
                </div>
            </div>
        </Html>
    );
}

export default function PhysicsDemo() {
    registerComponent(AdvancingTargetComponent);
    registerComponent(IndustrialMachineGunComponent);
    registerComponent(CrashcatPhysicsComponent);

    const [levelIndex, setLevelIndex] = useState<number | null>(null);
    const [stats, setStats] = useState<CombatStats>(() => createInitialStats());
    const roundAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setLevelIndex(Math.floor(Math.random() * LEVELS.length));
    }, []);

    const selectedLevel = levelIndex === null ? null : LEVELS[levelIndex];
    useEffect(() => {
        if (!selectedLevel) return;
        setStats(createInitialStats());
    }, [selectedLevel]);

    useEffect(() => {
        if (!selectedLevel || stats.roundHits < selectedLevel.data.hitGoal) return undefined;

        roundAdvanceTimer.current = setTimeout(() => {
            setLevelIndex((current) => current === null ? 0 : (current + 1) % LEVELS.length);
        }, 1200);

        return () => {
            if (roundAdvanceTimer.current) {
                clearTimeout(roundAdvanceTimer.current);
                roundAdvanceTimer.current = null;
            }
        };
    }, [selectedLevel, stats.roundHits]);

    useEffect(() => {
        if (!selectedLevel) return undefined;

        const stopShot = gameEvents.on(SHOT_EVENT, (payload: unknown) => {
            const detail = payload as { spawnMs?: unknown; activeProjectileCount?: unknown } | null;
            const spawnMs = readNumber(detail?.spawnMs) ?? 0;
            const liveRounds = readNumber(detail?.activeProjectileCount);

            setStats((current) => {
                const spawnSamples = current.spawnSamples + 1;
                const averageSpawnMs = current.averageSpawnMs + (spawnMs - current.averageSpawnMs) / spawnSamples;
                return {
                    ...current,
                    rounds: current.rounds + 1,
                    liveRounds: liveRounds ?? current.liveRounds,
                    spawnSamples,
                    averageSpawnMs,
                };
            });
        });
        const stopProjectileCount = gameEvents.on(PROJECTILE_COUNT_EVENT, (payload: unknown) => {
            const detail = payload as { activeProjectileCount?: unknown } | null;
            const activeProjectileCount = readNumber(detail?.activeProjectileCount);
            if (activeProjectileCount === undefined) return;
            setStats((current) => ({ ...current, liveRounds: activeProjectileCount }));
        });
        const stopHit = gameEvents.on(TARGET_HIT_EVENT, (payload: unknown) => {
            const detail = payload as { targetNodeId?: unknown } | null;
            if (typeof detail?.targetNodeId !== "string"
                || !detail.targetNodeId.startsWith(MACHINEGUN_PROJECTILE_ID_PREFIX)) return;

            const clip = TARGET_HIT_SOUNDS[Math.floor(Math.random() * TARGET_HIT_SOUNDS.length)];
            void soundManager.play(withBasePath(clip), {
                volume: 0.58,
                pitch: 0.9 + Math.random() * 0.18,
            });
            setStats((current) => ({
                ...current,
                hits: current.hits + 1,
                roundHits: Math.min(current.roundHits + 1, selectedLevel.data.hitGoal),
            }));
        });
        const stopBreach = gameEvents.on(TARGET_BREACH_EVENT, () => {
            setStats((current) => ({ ...current, breaches: current.breaches + 1 }));
        });
        const stopTrigger = gameEvents.on(TRIGGER_EVENT, (payload: unknown) => {
            const detail = payload as { active?: unknown } | null;
            setStats((current) => ({ ...current, firing: detail?.active === true }));
        });

        return () => {
            stopShot();
            stopProjectileCount();
            stopHit();
            stopBreach();
            stopTrigger();
        };
    }, [selectedLevel]);

    if (!selectedLevel) {
        return <main className="flex h-screen w-screen flex-col" style={{ background: DEFAULT_ATMOSPHERE.background }} />;
    }

    return (
        <main className="flex h-screen w-screen flex-col">
            <PrefabEditor
                key={selectedLevel.prefab.id}
                basePath={BASE_PATH}
                prefab={selectedLevel.prefab}
                mode={PrefabEditorMode.Play}
            >
                <CrashcatRuntime>
                    <PrefabRoot data={MECHSUIT_PREFAB} basePath={BASE_PATH} />
                    <SceneAtmosphere atmosphere={selectedLevel.data.atmosphere} />
                    <BattlefieldEffects />
                    <BattlefieldStatus stats={stats} />
                    <RoundHud level={selectedLevel.data} stats={stats} />
                </CrashcatRuntime>
            </PrefabEditor>
        </main>
    );
}

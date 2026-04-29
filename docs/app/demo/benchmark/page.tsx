"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrefabEditor, PrefabEditorMode, registerComponent } from "react-three-game";
import type { GameObject, Prefab, PrefabEditorRef } from "react-three-game";
import { CrashcatRuntime } from "../../components/CrashcatRuntime";
import CrashcatPhysicsComponent from "../../components/CrashcatPhysicsComponent";

registerComponent(CrashcatPhysicsComponent);

const TEST_COUNT = 100;
const ROOT_ID = "benchmark-root";
const BENCH_DELAY_MS = 2000;

type BenchmarkResult = {
    id: string;
    label: string;
    durationMs: number;
};

type BenchmarkDefinition = {
    id: string;
    label: string;
    createPrefab?: () => Prefab;
    settleFrames?: number;
    run: (editor: PrefabEditorRef) => Promise<void>;
};

function createEmptyPrefab(): Prefab {
    return {
        id: "benchmark-prefab",
        name: "Benchmark",
        root: {
            id: ROOT_ID,
            name: "Root",
            children: [],
            components: {
                transform: {
                    type: "Transform",
                    properties: {
                        position: [0, 0, 0],
                        rotation: [0, 0, 0],
                        scale: [1, 1, 1],
                    },
                },
            },
        },
    };
}

function createCrashcatFloorNode(): GameObject {
    return {
        id: "benchmark-floor",
        name: "Benchmark Floor",
        components: {
            transform: createTransform([0, -0.5, 0]),
            geometry: {
                type: "Geometry",
                properties: {
                    geometryType: "box",
                    args: [24, 1, 24],
                },
            },
            material: {
                type: "Material",
                properties: {
                    color: "#1e293b",
                    roughness: 0.95,
                },
            },
            crashcatPhysics: {
                type: "CrashcatPhysics",
                properties: {
                    friction: 0.9,
                },
            },
        },
    };
}

function createDynamicBenchmarkPrefab(): Prefab {
    const prefab = createEmptyPrefab();
    prefab.root.children = [createCrashcatFloorNode()];
    return prefab;
}

function createTransform(position: [number, number, number]) {
    return {
        type: "Transform",
        properties: {
            position,
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
        },
    };
}

function createGeometryMaterialNode(index: number): GameObject {
    const x = (index % 10) - 4.5;
    const z = Math.floor(index / 10) - 4.5;

    return {
        id: `mesh-${index}`,
        name: `Mesh ${index + 1}`,
        components: {
            transform: createTransform([x * 1.6, 0.5, z * 1.6]),
            geometry: {
                type: "Geometry",
                properties: {
                    geometryType: "box",
                    args: [1, 1, 1],
                },
            },
            material: {
                type: "Material",
                properties: {
                    color: `hsl(${(index * 17) % 360}, 65%, 55%)`,
                    roughness: 0.6,
                },
            },
        },
    };
}

function createInstancedNode(index: number): GameObject {
    const x = (index % 10) - 4.5;
    const z = Math.floor(index / 10) - 4.5;

    return {
        id: `instanced-${index}`,
        name: `Instanced ${index + 1}`,
        components: {
            transform: createTransform([x * 1.8, 0, z * 1.8]),
            model: {
                type: "Model",
                properties: {
                    filename: "models/environment/tree.glb",
                    instanced: true,
                    repeat: false,
                },
            },
        },
    };
}

function createStaticCrashcatNode(index: number): GameObject {
    const x = (index % 10) - 4.5;
    const z = Math.floor(index / 10) - 4.5;

    return {
        id: `crashcat-static-${index}`,
        name: `Crashcat Static ${index + 1}`,
        components: {
            transform: createTransform([x * 1.4, 0.5, z * 1.4]),
            geometry: {
                type: "Geometry",
                properties: {
                    geometryType: "box",
                    args: [1, 1, 1],
                },
            },
            material: {
                type: "Material",
                properties: {
                    color: "#7dd3fc",
                    metalness: 0.1,
                    roughness: 0.8,
                },
            },
            crashcatPhysics: {
                type: "CrashcatPhysics",
                properties: {},
            },
        },
    };
}

function createDynamicCrashcatNode(index: number): GameObject {
    const x = (index % 10) - 4.5;
    const z = Math.floor(index / 10) - 4.5;
    const y = 2 + Math.floor(index / 10) * 1.15;

    return {
        id: `crashcat-dynamic-${index}`,
        name: `Crashcat Dynamic ${index + 1}`,
        components: {
            transform: createTransform([x * 1.2, y, z * 1.2]),
            geometry: {
                type: "Geometry",
                properties: {
                    geometryType: "box",
                    args: [0.9, 0.9, 0.9],
                },
            },
            material: {
                type: "Material",
                properties: {
                    color: `hsl(${(index * 23) % 360}, 70%, 62%)`,
                    roughness: 0.7,
                },
            },
            crashcatPhysics: {
                type: "CrashcatPhysics",
                properties: {
                    type: "dynamic",
                    restitution: 0.1,
                    friction: 0.8,
                },
            },
        },
    };
}

function waitForFrames(count = 2) {
    return new Promise<void>((resolve) => {
        let remaining = count;

        const tick = () => {
            remaining -= 1;
            if (remaining <= 0) {
                resolve();
                return;
            }
            requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    });
}

export default function BenchmarkPage() {
    const editorRef = useRef<PrefabEditorRef>(null);
    const hasAutoStartedRef = useRef(false);
    const isRunningRef = useRef(false);
    const [isRunning, setIsRunning] = useState(false);
    const [results, setResults] = useState<BenchmarkResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const initialPrefab = useMemo(() => createEmptyPrefab(), []);

    const benchmarkDefinitions = useMemo<BenchmarkDefinition[]>(() => [
        {
            id: "mesh-material-100",
            label: "Add 100 geometry + material nodes",
            run: async (editor) => {
                for (let index = 0; index < TEST_COUNT; index += 1) {
                    editor.add(createGeometryMaterialNode(index), ROOT_ID);
                }
            },
        },
        {
            id: "instanced-100",
            label: "Add 100 instanced objects",
            run: async (editor) => {
                for (let index = 0; index < TEST_COUNT; index += 1) {
                    editor.add(createInstancedNode(index), ROOT_ID);
                }
            },
        },
        {
            id: "crashcat-static-100",
            label: "Add 100 static Crashcat bodies",
            run: async (editor) => {
                for (let index = 0; index < TEST_COUNT; index += 1) {
                    editor.add(createStaticCrashcatNode(index), ROOT_ID);
                }
            },
        },
        {
            id: "crashcat-dynamic-100",
            label: "Add 100 dynamic Crashcat bodies",
            createPrefab: createDynamicBenchmarkPrefab,
            settleFrames: 8,
            run: async (editor) => {
                for (let index = 0; index < TEST_COUNT; index += 1) {
                    editor.add(createDynamicCrashcatNode(index), ROOT_ID);
                }
            },
        },
    ], []);

    const totalTimeMs = useMemo(
        () => results.reduce((sum, result) => sum + result.durationMs, 0),
        [results],
    );

    const runBenchmarks = useCallback(async () => {
        const editor = editorRef.current;
        if (!editor || isRunningRef.current) return;

        isRunningRef.current = true;
        setIsRunning(true);
        setError(null);
        setResults([]);
        console.log("[benchmark] starting prefab editor benchmark run");

        try {
            const nextResults: BenchmarkResult[] = [];

            for (let benchIndex = 0; benchIndex < benchmarkDefinitions.length; benchIndex += 1) {
                const benchmark = benchmarkDefinitions[benchIndex];
                if (benchIndex > 0) {
                    await new Promise<void>((resolve) => setTimeout(resolve, BENCH_DELAY_MS));
                }
                editor.load((benchmark.createPrefab ?? createEmptyPrefab)(), { resetHistory: true, notifyChange: false });
                await waitForFrames();

                const startTime = performance.now();
                await benchmark.run(editor);
                await waitForFrames(benchmark.settleFrames ?? 2);
                const endTime = performance.now();

                nextResults.push({
                    id: benchmark.id,
                    label: benchmark.label,
                    durationMs: endTime - startTime,
                });

                console.log(
                    `[benchmark] ${benchmark.id}: ${nextResults[nextResults.length - 1].durationMs.toFixed(2)} ms`,
                );

                setResults([...nextResults]);
            }

            const totalDurationMs = nextResults.reduce((sum, result) => sum + result.durationMs, 0);
            console.log(`[benchmark] total: ${totalDurationMs.toFixed(2)} ms`);
            console.log("[benchmark:summary]", JSON.stringify({
                results: nextResults,
                totalDurationMs,
                error: null,
            }));
        } catch (runError) {
            console.error("[benchmark] failed", runError);
            const message = runError instanceof Error ? runError.message : "Benchmark failed";
            setError(message);
            console.log("[benchmark:summary]", JSON.stringify({
                results: [],
                totalDurationMs: 0,
                error: message,
            }));
        } finally {
            isRunningRef.current = false;
            setIsRunning(false);
        }
    }, [benchmarkDefinitions]);

    useEffect(() => {
        if (hasAutoStartedRef.current) return;

        let frameId = 0;

        const tryStart = () => {
            if (!editorRef.current) {
                frameId = requestAnimationFrame(tryStart);
                return;
            }

            hasAutoStartedRef.current = true;
            void runBenchmarks();
        };

        frameId = requestAnimationFrame(tryStart);

        return () => {
            cancelAnimationFrame(frameId);
        };
    }, [runBenchmarks]);

    return (
        <main className="relative h-screen w-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#202f45_0%,_#0b1017_52%,_#04070b_100%)] text-white">
            <PrefabEditor
                ref={editorRef}
                initialPrefab={initialPrefab}
                mode={PrefabEditorMode.Play}
                enableWindowDrop={false}
                canvasProps={{
                    camera: { position: [10, 12, 18], fov: 45 },
                }}
            >
                <CrashcatRuntime debug />
                <ambientLight intensity={1.8} />
                <directionalLight intensity={2.2} position={[8, 12, 6]} castShadow />
            </PrefabEditor>

            <section className="absolute bottom-6 left-6 w-[min(26rem,calc(100vw-3rem))] bg-black/70 p-2 text-sm text-white">
                <p className="text-[11px] text-slate-400">PrefabEditor Benchmark</p>
                <h1 className="mt-1 text-base font-medium text-white">Mutation profiling</h1>
                <p className="mt-1 text-xs leading-5 text-slate-300">
                    Runs editor-ref scene mutations against a blank prefab and measures total wall-clock time after the scene settles.
                </p>

                <button
                    type="button"
                    onClick={runBenchmarks}
                    disabled={isRunning}
                    className="mt-3 inline-flex items-center border border-white/20 px-2 py-1 text-xs text-white disabled:cursor-wait disabled:opacity-50"
                >
                    {isRunning ? "Running…" : "Start"}
                </button>

                <div className="mt-3 space-y-1.5 text-xs text-slate-200">
                    {benchmarkDefinitions.map((benchmark) => {
                        const result = results.find(entry => entry.id === benchmark.id);
                        return (
                            <div key={benchmark.id} className="border-t border-white/10 pt-1.5">
                                <div>{benchmark.label}</div>
                                <div className="text-slate-400">
                                    {result ? `${result.durationMs.toFixed(2)} ms` : "Pending"}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-3 border-t border-white/10 pt-1.5">
                    <div className="text-[11px] text-slate-400">Total time</div>
                    <div className="text-base text-white">
                        {results.length > 0 ? `${totalTimeMs.toFixed(2)} ms` : "--"}
                    </div>
                </div>

                {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
            </section>
        </main>
    );
}

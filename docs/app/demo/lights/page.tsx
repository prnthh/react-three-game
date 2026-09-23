"use client";

import Link from 'next/link';
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, DirectionalLight, InstancedMesh, Object3D, Vector3 } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { CascadedDirectionalLight, GameCanvas, PrefabInstance, GameEventsProvider, useInvalidateShadows, useShadowUpdates } from 'react-three-game/viewer';
import { BudgetedLights, type LightBudget, type LightBudgetStats, type RuntimeLight } from './BudgetedLights';
import { BASE_PATH } from '../../basePath';

const PRESETS = {
    Economy: { point: 6, spot: 2 },
    Balanced: { point: 12, spot: 4 },
    Rich: { point: 24, spot: 4 },
} satisfies Record<string, LightBudget>;
type Preset = keyof typeof PRESETS;
type Metrics = LightBudgetStats & { fps: number; frame: number; cpu: number; gpu: number | null; draws: number; triangles: number; textures: number };
const EMPTY: Metrics = { contributing: 0, fps: 0, frame: 0, cpu: 0, gpu: null, draws: 0, triangles: 0, textures: 0 };

function Sun({ cascades }: { cascades: boolean }) {
    const sun = useMemo(() => {
        const light = new DirectionalLight('#ffe2b3', 2.2);
        light.position.set(-8, 18, 6);
        light.castShadow = true;
        light.shadow.mapSize.setScalar(1024);
        light.shadow.normalBias = 0.035;
        light.shadow.bias = -0.0001;
        Object.assign(light.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 0.1, far: 65 });
        light.shadow.camera.updateProjectionMatrix();
        light.shadow.autoUpdate = false;
        return light;
    }, []);
    const sunRef = useMemo(() => ({ current: sun }), [sun]);
    useShadowUpdates(sunRef);
    useEffect(() => () => sun.dispose(), [sun]);
    if (cascades) return <>
        <CascadedDirectionalLight position={[-8, 18, 6]} color="#ffe2b3" intensity={2.2}
            target={sun.target} cascades={3} maxFar={45} lightMargin={25}
            shadow-mapSize={[1024, 1024]} shadow-normalBias={0.035} shadow-bias={-0.0001} />
        <primitive object={sun.target} />
    </>;
    return <>
        <primitive object={sun} /><primitive object={sun.target} />
    </>;
}

function LightingRig({ count, animate, budget, stats }: {
    count: number; animate: boolean; budget: LightBudget; stats: React.RefObject<LightBudgetStats>;
}) {
    const lights = useMemo<RuntimeLight[]>(() => Array.from({ length: count }, (_, i) => {
        // Deterministic placement: changing quality leaves the authored scene unchanged.
        const x = ((i * 0.61803398875) % 1 - 0.5) * 27;
        const z = ((i * 0.41421356237) % 1 - 0.5) * 10;
        const y = 1.5 + (i % 3) * 1.5;
        return { id: `lamp-${i}`, type: i % 5 === 0 ? 'spot' : 'point', position: new Vector3(x, y, z),
            target: new Vector3(x + 0.7, 0, z), color: new Color().setHSL((i * 0.13) % 1, 0.65, 0.65),
            intensity: i % 5 === 0 ? 32 : 12, range: i % 5 === 0 ? 8 : 3.5 };
    }), [count]);
    const origins = useMemo(() => lights.map(light => light.position.clone()), [lights]);
    const markers = useRef<InstancedMesh>(null!);
    const dummy = useMemo(() => new Object3D(), []);
    const time = useRef(0);
    useFrame((_, delta) => {
        if (animate) time.current += Math.min(delta, 0.05);
        lights.forEach((light, i) => {
            light.position.copy(origins[i]);
            light.position.x += Math.sin(time.current * 0.6 + i) * 0.55;
            light.position.z += Math.cos(time.current * 0.4 + i) * 0.35;
            dummy.position.copy(light.position); dummy.updateMatrix();
            markers.current.setMatrixAt(i, dummy.matrix);
            markers.current.setColorAt(i, light.color);
        });
        markers.current.instanceMatrix.needsUpdate = true;
        if (markers.current.instanceColor) markers.current.instanceColor.needsUpdate = true;
    }, -2);
    return <>
        <BudgetedLights lights={lights} budget={budget} onStats={value => { stats.current = value; }} />
        <instancedMesh key={count} ref={markers} args={[undefined, undefined, count]} frustumCulled={false}>
            <sphereGeometry args={[0.045, 6, 4]} /><meshBasicMaterial />
        </instancedMesh>
    </>;
}

function Meter({ stats, report }: { stats: React.RefObject<LightBudgetStats>; report: (value: Metrics) => void }) {
    const renderer = useThree(state => state.gl) as unknown as WebGPURenderer;
    const window = useRef({ frames: 0, seconds: 0, cpu: 0, gpu: null as number | null, pending: false, draws: 0, triangles: 0 });
    useEffect(() => { const previous = renderer.info.autoReset; renderer.info.autoReset = false; return () => { renderer.info.autoReset = previous; }; }, [renderer]);
    // This demo owns rendering so submission time and draw counts include every shadow pass.
    useFrame(({ scene, camera }, delta) => {
        const sample = window.current;
        renderer.info.reset();
        const start = performance.now();
        renderer.render(scene, camera);
        sample.cpu += performance.now() - start;
        sample.seconds += delta; sample.frames++;
        sample.draws += renderer.info.render.drawCalls;
        sample.triangles += renderer.info.render.triangles;
        if (renderer.hasFeature('timestamp-query') && !sample.pending) {
            sample.pending = true;
            renderer.resolveTimestampsAsync().then(value => { if (typeof value === 'number') sample.gpu = value; })
                .catch(() => { sample.gpu = null; }).finally(() => { sample.pending = false; });
        }
        if (sample.seconds >= 1) {
            report({ ...stats.current, fps: sample.frames / sample.seconds, frame: sample.seconds * 1000 / sample.frames,
                cpu: sample.cpu / sample.frames, gpu: sample.gpu, draws: Math.round(sample.draws / sample.frames), triangles: Math.round(sample.triangles / sample.frames), textures: renderer.info.memory.textures });
            sample.frames = sample.seconds = sample.cpu = sample.draws = sample.triangles = 0;
        }
    }, 1);
    return null;
}

class DemoBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
    state = { error: null as string | null };
    static getDerivedStateFromError(error: Error) { return { error: error.message }; }
    render() { return this.state.error ? <div role="alert" className="p-8">Unable to start WebGPU: {this.state.error}</div> : this.props.children; }
}

function LightsDemoContent() {
    const invalidateShadows = useInvalidateShadows();
    const [preset, setPreset] = useState<Preset>('Balanced');
    const [count, setCount] = useState(64);
    const [animate, setAnimate] = useState(true);
    const [cascades, setCascades] = useState(false);
    const [dpr, setDpr] = useState(1);
    const [status, setStatus] = useState('Loading Pavilion…');
    const [metrics, setMetrics] = useState(EMPTY);
    const stats = useRef<LightBudgetStats>(EMPTY);
    const budget = PRESETS[preset];
    return <main className="h-screen w-screen bg-[#0c1018] text-slate-100">
        <DemoBoundary>
            <GameCanvas camera={{ position: [19, 13, 19], fov: 65, near: 0.1, far: 65 }} dpr={dpr} glConfig={{ trackTimestamp: true }}>
                <color attach="background" args={['#121d2c']} />
                <hemisphereLight args={['#b8d7ff', '#49372d', 0.55]} />
                <Sun cascades={cascades} />
                <PrefabInstance id="light-lab" basePath={BASE_PATH} url="/prefabs/light-lab.json" static onStatus={event => {
                    if (event.phase === 'active') invalidateShadows();
                    setStatus(event.phase === 'active' ? '' : event.phase === 'error' ? String(event.error) : `${event.phase} Pavilion…`);
                }} />
                <LightingRig count={count} animate={animate} budget={budget} stats={stats} />
                <OrbitControls target={[0, 1.5, 0]} maxDistance={45} minDistance={0.5} />
                <Meter stats={stats} report={setMetrics} />
            </GameCanvas>
        </DemoBoundary>
        <aside className="absolute left-4 top-4 max-h-[calc(100vh-2rem)] w-72 overflow-auto rounded-2xl border border-white/15 bg-slate-950/85 p-5 shadow-xl backdrop-blur">
            <Link href="/" className="text-xs text-slate-400">← All demos</Link>
            <h1 className="mt-3 text-xl font-semibold">Pavilion · Light lab</h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">Explore a generated pavilion of columns, screens, and sculptures. Colored lights are selected by distance and viewing direction. One sun casts the shadows; local lights add unshadowed color.</p>
            <div className="my-4 grid grid-cols-3 gap-1">{(Object.keys(PRESETS) as Preset[]).map(name => <button key={name} onClick={() => setPreset(name)} aria-pressed={preset === name} className={`rounded py-2 text-xs ${preset === name ? 'bg-amber-300 text-slate-950' : 'bg-white/10'}`}>{name}</button>)}</div>
            <label className="mb-3 flex items-center justify-between text-sm">Authored lights<select aria-label="Authored lights" className="rounded bg-slate-800 p-1" value={count} onChange={event => setCount(Number(event.target.value))}>{[32,64,128,256].map(n => <option key={n}>{n}</option>)}</select></label>
            <label className="mb-3 flex items-center justify-between text-sm">Resolution scale<select aria-label="Resolution scale" className="rounded bg-slate-800 p-1" value={dpr} onChange={event => setDpr(Number(event.target.value))}>{[0.75,1,1.5].map(n => <option key={n}>{n}</option>)}</select></label>
            <label className="mb-2 flex justify-between text-sm">Animate lights<input type="checkbox" checked={animate} onChange={event => setAnimate(event.target.checked)} /></label>
            <label className="mb-4 flex justify-between text-sm">Sun: 3 cascades<input type="checkbox" checked={cascades} onChange={event => setCascades(event.target.checked)} /></label>
            <div className="grid grid-cols-2 gap-3 border-y border-white/10 py-4 font-mono text-xs">
                <div><b className="block text-xl text-amber-200">{metrics.fps.toFixed(0)}</b>FPS</div>
                <div><b className="block text-xl">{metrics.frame.toFixed(1)} ms</b>frame interval</div>
                <div>{metrics.cpu.toFixed(1)} ms<br /><span className="text-slate-400">CPU submit</span></div>
                <div>{metrics.gpu === null ? 'unavailable' : `${metrics.gpu.toFixed(1)} ms`}<br /><span className="text-slate-400">GPU render passes</span></div>
                <div>{metrics.contributing} / {count}<br /><span className="text-slate-400">contributing lights</span></div>
                <div>{cascades ? 3 : 1}<br /><span className="text-slate-400">sun shadow maps</span></div>
                <div>{metrics.draws} draws<br /><span className="text-slate-400">including shadows</span></div>
                <div>{(metrics.triangles / 1000).toFixed(0)}k triangles<br /><span className="text-slate-400">including shadows</span></div>
                <div>{metrics.textures} textures<br /><span className="text-slate-400">resident GPU textures</span></div>
            </div>
            <button onClick={() => invalidateShadows()} className="mt-3 rounded bg-white/10 px-3 py-2 text-xs">Refresh sun shadow</button>
            <p className="mt-3 text-xs text-slate-400">1024px sun shadow, cached until refreshed. Optional cascades follow the camera and update every frame.</p>
            <p className="mt-3 text-xs text-slate-500">Quality changes only the number of active colored lights. Local lights do not cast shadows and can illuminate through walls.</p>
        </aside>
        {status && <div role="status" className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded bg-slate-950/90 px-5 py-3 text-sm">{status}</div>}
        <p className="absolute bottom-4 right-4 text-xs text-white/50">Drag to orbit · Scroll to move closer · Right-drag to pan</p>
    </main>;
}

export default function LightsDemo() {
    return <GameEventsProvider><LightsDemoContent /></GameEventsProvider>;
}

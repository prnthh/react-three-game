'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { GameCanvas, PrefabRoot, registerComponent } from 'react-three-game/viewer';
import InteriorMapComponent from './InteriorMapComponent';
import { createInteriorScene } from './scene';
import { BASE_PATH, withBasePath } from '../../basePath';

registerComponent(InteriorMapComponent);

export default function InteriorDemo() {
    const [depth, setDepth] = useState(3);
    const [instanced, setInstanced] = useState(true);
    const scene = useMemo(() => createInteriorScene(depth, instanced), [depth, instanced]);
    return <main className="h-screen bg-slate-950 text-slate-100">
        <GameCanvas camera={{ position: [8, 5, 12], fov: 45 }}>
            <color attach="background" args={['#18222c']} />
            <ambientLight intensity={1.6} />
            <directionalLight position={[5, 8, 10]} intensity={1.5} />
            <PrefabRoot key={`${depth}:${instanced}`} data={scene} basePath={BASE_PATH} />
            {[-3, 0, 3].flatMap(x => [1.5, 4.3].map(y => <group key={`${x}:${y}`} position={[x, y, 0]}>
                {[-1.28, 1.28].map(dx => <mesh key={dx} position={[dx, 0, 0.06]}><boxGeometry args={[0.16, 2.52, 0.22]} /><meshStandardMaterial color="#bda782" /></mesh>)}
                {[-1.18, 1.18].map(dy => <mesh key={dy} position={[0, dy, 0.06]}><boxGeometry args={[2.4, 0.16, 0.22]} /><meshStandardMaterial color="#bda782" /></mesh>)}
            </group>))}
            <mesh position={[0, -0.1, 0]}><boxGeometry args={[13, 0.2, 8]} /><meshStandardMaterial color="#36444e" /></mesh>
            <OrbitControls enableDamping={false} target={[0, 2.8, 0]} minDistance={4} maxDistance={22} minAzimuthAngle={-1.25} maxAzimuthAngle={1.25} maxPolarAngle={Math.PI * 0.65} />
        </GameCanvas>
        <aside className="absolute left-5 top-5 w-72 rounded-xl border border-white/15 bg-slate-950/90 p-5">
            <Link href="/" className="text-xs text-slate-400">← All demos</Link>
            <h1 className="mt-3 text-xl font-semibold">Interior mapping</h1>
            <p className="my-3 text-sm text-slate-300">Six flat windows. Move the camera to see rooms with depth, computed in the material.</p>
            <label className="block text-sm">Room depth: {depth.toFixed(1)}
                <input className="mt-2 w-full" aria-label="Room depth" type="range" min="0.5" max="6" step="0.5" value={depth} onChange={e => setDepth(Number(e.target.value))} />
            </label>
            <label className="my-4 flex justify-between text-sm">Batch windows<input type="checkbox" checked={instanced} onChange={e => setInstanced(e.target.checked)} /></label>
            <pre className="overflow-auto rounded bg-white/5 p-3 text-xs">{`Mesh\nGeometry: plane [2.4, 2.2]\nInteriorMap:\n  roomSize: [2.4, 2.2, ${depth}]`}</pre>
            <p className="mt-3 text-xs text-slate-400">The room atlas supplies five visible surfaces. This illusion has no furniture geometry, collision, or interior shadows.</p>
            <div className="mt-4 flex gap-4 text-xs underline"><Link href="/demo/interior/editor">Edit the prefab</Link><a href={withBasePath('/textures/interiors/room-atlas.svg')}>View atlas</a></div>
        </aside>
    </main>;
}

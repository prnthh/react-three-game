"use client";

import Link from 'next/link';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { GameCanvas, useSkinnedModel } from 'react-three-game/viewer';
import { AgXToneMapping, BufferGeometry, Float32BufferAttribute, Group, Mesh, OrthographicCamera } from 'three';
import { withBasePath } from '../../basePath';
import { NavigationMesh, type NavmeshData, type Point } from './navigation';
import { Walker } from './walker';
import composition from '../../../public/models/frozen-yard/composition.json';

const asset = (name: string) => withBasePath(`/models/frozen-yard/${name}`);
const starts: Point[] = [[0, .025, 5], [2, .025, 0], [-7, .025, 7]];

function Camera() {
    const { camera, size } = useThree();
    useLayoutEffect(() => {
        const c = camera as OrthographicCamera;
        const width = Math.max(composition.width, composition.width / composition.aspect * size.width / size.height);
        c.left = -width / 2; c.right = width / 2;
        c.top = width * size.height / size.width / 2; c.bottom = -c.top;
        c.position.fromArray(composition.position); c.lookAt(composition.target[0], composition.target[1], composition.target[2]); c.updateProjectionMatrix();
    }, [camera, size]);
    return null;
}
function Scenery({ ready }: { ready: () => void }) {
    const { scene } = useGLTF(asset('scene.glb'));
    useLayoutEffect(() => { scene.traverse(o => { if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = true; } }); ready(); }, [scene, ready]);
    return <primitive object={scene} />;
}
function Remilio({ navigation, index, paused }: { navigation: NavigationMesh; index: number; paused: boolean }) {
    const source = useGLTF(withBasePath('/models/fps/pockit-remilio.glb'));
    const model = useSkinnedModel(source.scene, { animations: source.animations });
    const group = useRef<Group>(null);
    const walker = useMemo(() => new Walker(navigation, starts[index], .72 + index * .07, 713 + index * 51), [navigation, index]);
    useEffect(() => { model?.object.traverse(o => { if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = true; } }); }, [model]);
    useFrame((_, delta) => {
        if (!group.current || !model) return;
        if (!paused) walker.update(delta);
        group.current.position.set(...walker.position);
        group.current.rotation.y = walker.heading;
        model.setAnimationState(!paused && walker.moving ? 'walk' : 'idle');
        model.update(Math.min(delta, .1));
    });
    return <group ref={group} name={`Remilio-${index + 1}`} position={starts[index]}>{model && <primitive object={model.object} />}</group>;
}
function WalkableArea({ navigation }: { navigation: NavigationMesh }) {
    const geometry = useMemo(() => {
        const g = new BufferGeometry();
        g.setAttribute('position', new Float32BufferAttribute(navigation.data.vertices.flat(), 3));
        g.setIndex(navigation.data.triangles.flat()); g.computeVertexNormals(); return g;
    }, [navigation]);
    useEffect(() => () => geometry.dispose(), [geometry]);
    return <mesh geometry={geometry} position={[0, .04, 0]} name="Navigation preview"><meshBasicMaterial color="#67e4cf" transparent opacity={.34} depthWrite={false} side={2} /></mesh>;
}
export default function FrozenYard() {
    const [navigation, setNavigation] = useState<NavigationMesh | null>(null);
    const [error, setError] = useState('');
    const [loaded, setLoaded] = useState(false);
    const ready = useMemo(() => () => setLoaded(true), []);
    const [paused, setPaused] = useState(false), [showNavigation, setShowNavigation] = useState(false);
    useEffect(() => {
        const abort = new AbortController();
        fetch(asset('navmesh.json'), { signal: abort.signal }).then(r => { if (!r.ok) throw Error('Could not load walking paths'); return r.json(); })
            .then((data: NavmeshData) => setNavigation(new NavigationMesh(data))).catch(e => { if (!abort.signal.aborted) setError(String(e)); });
        return () => abort.abort();
    }, []);
    return <main style={{ height: '100dvh', width: '100%', background: '#55585b', color: '#e5e2d9', overflow: 'hidden' }}>
        <GameCanvas orthographic shadows dpr={[1, 1.5]} camera={{ near: .1, far: 160 }} glConfig={{ antialias: true }} onCreated={({ gl }) => { gl.toneMapping = AgXToneMapping; gl.toneMappingExposure = 1.05; }}>
            <color attach="background" args={['#55585b']} />
            <Camera />
            <hemisphereLight args={['#bbc6dc', '#8b8177', 2.1]} />
            <directionalLight position={[-10, 18, 12]} intensity={2.0} color="#fff0d9" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-26} shadow-camera-right={26} shadow-camera-top={26} shadow-camera-bottom={-26} shadow-camera-near={.1} shadow-camera-far={80} shadow-normalBias={.025} />
            <Suspense fallback={null}>
                <Scenery ready={ready} />
                {navigation && starts.map((_, index) => <Remilio key={index} index={index} navigation={navigation} paused={paused} />)}
                {navigation && showNavigation && <WalkableArea navigation={navigation} />}
            </Suspense>
        </GameCanvas>
        <header style={{ position: 'absolute', top: 28, left: 32, textShadow: '0 2px 8px #111', pointerEvents: 'none' }}>
            <h1 style={{ fontSize: 23, letterSpacing: '.22em', margin: 0 }}>FROZEN YARD</h1>
            <p style={{ fontSize: 11, letterSpacing: '.16em', opacity: .75, marginTop: 7 }}>A WINTER WALK THROUGH THE OLD WORKS</p>
        </header>
        <nav aria-label="Scene controls" style={{ position: 'absolute', bottom: 24, left: 24, display: 'flex', gap: 20, padding: '12px 18px', background: '#25292cdd', border: '1px solid #ffffff20', fontSize: 12 }}>
            <Link href="/">← Examples</Link>
            <button onClick={() => setPaused(!paused)} aria-pressed={paused}>{paused ? 'Resume walkers' : 'Pause walkers'}</button>
            <button onClick={() => setShowNavigation(!showNavigation)} aria-pressed={showNavigation}>{showNavigation ? 'Hide walking area' : 'Show walking area'}</button>
        </nav>
        {!loaded && !error && <p role="status" style={{ position: 'absolute', top: '48%', width: '100%', textAlign: 'center' }}>Loading the yard…</p>}
        {error && <p role="alert" style={{ position: 'absolute', top: 100, left: 32 }}>{error}</p>}
    </main>;
}

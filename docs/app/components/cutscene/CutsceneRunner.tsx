import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ANIMATED_MODEL_COMPONENT, PrefabEditorMode, useGameEvents, useGameObject, usePrefab, useScene, type Component, type ComponentViewProps, type GameObjectHandle } from 'react-three-game/viewer';
import { characterIds, parseScript, type Script } from './script';
import { Runner, type Actor } from './Runner';
import { SpeakerCamera } from './SpeakerCamera';

type Properties = { source?: string; channel?: string; loop?: boolean };
const resolve = (base: string, path: string) => /^(https?:|data:|blob:)/.test(path) ? path : `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

function BindCharacter({ id, bindings }: { id: string; bindings: Map<string, GameObjectHandle> }) {
    const object = useGameObject(id);
    useEffect(() => { bindings.set(id, object); return () => { bindings.delete(id); }; }, [bindings, id, object]);
    return null;
}

function Playback({ script, channel, loop }: { script: Script; channel: string; loop: boolean }) {
    const prefab = usePrefab();
    const events = useGameEvents();
    const [bindings] = useState(() => new Map<string, GameObjectHandle>());
    const [ids] = useState(() => characterIds(script));
    const runner = useRef<Runner | null>(null);
    const getThree = useThree(state => state.get);
    const [shot] = useState(() => new SpeakerCamera());
    useEffect(() => () => { runner.current?.dispose(); runner.current = null; }, []);
    useFrame((_, delta) => {
        if (!runner.current) {
            const actors: Record<string, Actor> = Object.create(null);
            for (const id of ids) {
                const binding = bindings.get(id);
                const object = binding?.transform;
                const model = binding?.getComponent(ANIMATED_MODEL_COMPONENT);
                if (!object || !model) return;
                const originalPosition = object.position.clone();
                const originalRotation = object.rotation.clone();
                const originalAnimation = model.animationState;
                actors[id] = {
                    position: () => object.position.toArray(),
                    place: point => { object.position.fromArray(point); object.updateMatrixWorld(true); },
                    face: point => {
                        const x = point[0] - object.position.x, z = point[2] - object.position.z;
                        if (x * x + z * z > 0.0001) object.rotation.y = Math.atan2(x, z);
                        object.updateMatrixWorld(true);
                    },
                    animate: name => {
                        const state = model.animationStates.find(s => s.toLowerCase() === name.toLowerCase())
                            ?? model.animationStates.find(s => s.toLowerCase() === 'idle') ?? model.animationStates[0];
                        if (state && state !== model.animationState) model.setAnimationState(state);
                    },
                    update: dt => model.update(dt),
                    reset: () => {
                        object.position.copy(originalPosition); object.rotation.copy(originalRotation); object.updateMatrixWorld(true);
                        model.setAnimationState(originalAnimation, true); model.update(0);
                    },
                };
            }
            runner.current = new Runner(script, actors, src => new Audio(resolve(prefab.basePath, src)), caption => events.emit(`${channel}:dialogue`, caption), loop, id => {
                if (!id) { shot.restore(); return; }
                const binding = bindings.get(id);
                const object = binding?.transform;
                const model = binding?.getComponent(ANIMATED_MODEL_COMPONENT);
                if (object && model) shot.focus(getThree().camera, object, model.object);
            });
            events.emit(`${channel}:dialogue`, null);
        }
        runner.current.tick(delta);
    });
    return <>{ids.map(id => <BindCharacter key={id} id={id} bindings={bindings} />)}</>;
}

function CutsceneRunnerView({ properties, children }: ComponentViewProps<Properties>) {
    const { mode } = useScene();
    const prefab = usePrefab();
    const events = useGameEvents();
    const [loaded, setLoaded] = useState<{ source: string; script: Script } | null>(null);
    const source = properties.source ?? '';
    const channel = properties.channel ?? 'cutscene';
    useEffect(() => {
        if (mode !== PrefabEditorMode.Play) return;
        const abort = new AbortController();
        events.emit(`${channel}:dialogue`, { text: 'Loading scene…' });
        fetch(resolve(prefab.basePath, source), { signal: abort.signal, cache: 'no-store' })
            .then(response => { if (!response.ok) throw new Error(`Script request failed (${response.status})`); return response.json(); })
            .then(data => {
                if (abort.signal.aborted) return;
                const script = parseScript(data);
                for (const id of characterIds(script)) {
                    const node = prefab.get(id);
                    if (!node) throw new Error(`Character node not found: ${id}`);
                    const model = Object.values(node.components ?? {}).find(component => component?.type === 'AnimatedModel');
                    if (!model || model.properties.autoUpdate !== false) throw new Error(`${id}: AnimatedModel requires autoUpdate: false`);
                }
                setLoaded({ source, script });
            })
            .catch(error => { if (!abort.signal.aborted) events.emit(`${channel}:dialogue`, { text: String(error) }); });
        return () => abort.abort();
    }, [source, channel, mode, prefab, events]);
    return <>{children}{mode === PrefabEditorMode.Play && loaded?.source === source && <Playback key={`${source}:${channel}:${properties.loop}`} script={loaded.script} channel={channel} loop={properties.loop ?? true} />}</>;
}

const CutsceneRunner: Component<Properties> = {
    name: 'CutsceneRunner',
    View: CutsceneRunnerView,
    properties: {
        source: { type: 'string', default: '/cutscenes/infinite-tv.json' },
        channel: { type: 'string', default: 'infinite-tv' },
        loop: { type: 'boolean', default: true },
    },
};
export default CutsceneRunner;

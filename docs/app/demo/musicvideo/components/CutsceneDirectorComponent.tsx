import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { AudioContext as ThreeAudioContext } from 'three';
import { resolveAssetPath, useAssetRuntime, useNode, usePrefab, usePrefabStoreApi,
    type Component, type ComponentViewProps } from 'react-three-game/viewer';
import { createTimelinePlayer, isAudioCue, parseTimeline, type Timeline } from '../timeline';

type DirectorProperties = { timeline: string };
type Playback = { context: AudioContext; start: number; player: ReturnType<typeof createTimelinePlayer>;
    sources: Set<AudioBufferSourceNode>; gains: Set<GainNode> };

function DirectorView({ properties, children }: ComponentViewProps<DirectorProperties>) {
    const editMode = useNode(node => node.editMode);
    const { basePath } = usePrefab();
    const store = usePrefabStoreApi();
    const assets = useAssetRuntime();
    const [timeline, setTimeline] = useState<Timeline | null>(null);
    const playback = useRef<Playback | null>(null);
    const failed = useRef(false);

    useEffect(() => {
        // Resume synchronously inside the user's interaction, before async loading
        // or a frame callback can lose transient user activation.
        const unlock = () => {
            const context = ThreeAudioContext.getContext() as unknown as AudioContext;
            void context.resume().catch(error => console.error('Cutscene audio:', error));
        };
        window.addEventListener('pointerdown', unlock, true);
        window.addEventListener('click', unlock, true);
        window.addEventListener('keydown', unlock, true);
        return () => {
            window.removeEventListener('pointerdown', unlock, true);
            window.removeEventListener('click', unlock, true);
            window.removeEventListener('keydown', unlock, true);
        };
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        setTimeline(null);
        void (async () => {
            const response = await fetch(resolveAssetPath(basePath, properties.timeline), { signal: controller.signal });
            if (!response.ok) throw new Error(`Timeline load failed (${response.status}).`);
            const loaded = parseTimeline(await response.json());
            const paths = new Set(loaded.commands.filter(isAudioCue).map(cue => resolveAssetPath(basePath, cue.clip)));
            // Component dependencies describe assets but do not load inline-scene
            // sounds automatically. Explicitly preload every timeline audio cue.
            await Promise.all([...paths].map(path => assets.loadSound(path)));
            if (!controller.signal.aborted) setTimeline(loaded);
        })().catch(error => { if (!controller.signal.aborted) console.error('Cutscene Director:', error); });
        return () => controller.abort();
    }, [basePath, properties.timeline, assets]);

    useEffect(() => {
        failed.current = false;
        return () => {
            const active = playback.current;
            playback.current = null;
            if (!active) return;
            active.sources.forEach(source => { source.onended = null; source.stop(); source.disconnect(); });
            active.gains.forEach(gain => gain.disconnect());
            active.player.stop();
        };
    }, [editMode, timeline, store]);

    useFrame(() => {
        if (editMode || !timeline || failed.current) return;
        try {
            if (!playback.current) {
                const context = ThreeAudioContext.getContext() as unknown as AudioContext;
                if (context.state !== 'running') return;
                const start = context.currentTime;
                const sources = new Set<AudioBufferSourceNode>();
                const gains = new Set<GainNode>();
                const player = createTimelinePlayer(timeline, store, cue => {
                    const buffer = assets.getSound(resolveAssetPath(basePath, cue.clip));
                    if (!buffer) throw new Error(`Audio cue not loaded: ${cue.clip}`);
                    const offset = Math.max(0, context.currentTime - (start + cue.time));
                    if (offset >= buffer.duration) return;
                    const source = context.createBufferSource();
                    const gain = context.createGain();
                    source.buffer = buffer;
                    gain.gain.value = cue.volume ?? 1;
                    source.connect(gain);
                    gain.connect(context.destination);
                    sources.add(source);
                    gains.add(gain);
                    source.onended = () => {
                        source.disconnect(); gain.disconnect(); sources.delete(source); gains.delete(gain);
                    };
                    source.start(0, offset);
                });
                playback.current = { context, start, player, sources, gains };
            }
            const active = playback.current;
            active.player.advance(active.context.currentTime - active.start);
        } catch (error) {
            failed.current = true;
            console.error('Cutscene Director:', error);
        }
    });
    return <>{children}</>;
}

const CutsceneDirectorComponent: Component<DirectorProperties> = {
    name: 'CutsceneDirector',
    description: 'Execute property changes and playAudio commands from a JSON timeline using the audio clock. Restores authored values on leaving Play.',
    category: 'misc',
    View: DirectorView,
    properties: { timeline: { type: 'string', default: '/timelines/music-video.json' } },
};
export default CutsceneDirectorComponent;

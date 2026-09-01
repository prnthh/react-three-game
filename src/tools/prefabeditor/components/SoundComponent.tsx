import { useEffect, useMemo, useRef } from 'react';
import { useAssetRuntime, useSoundAssetRevision } from '../assetRuntime';
import { useNode } from '../SceneContext';
import { gameEvents, type ContactEventPayload, type NodePointerEventPayload } from '../GameEvents';
import type { Component, ComponentEditorProps, ComponentViewProps } from './ComponentRegistry';
import { BooleanField, FieldGroup, FieldRenderer, ListEditor, NumberField, SelectField, StringField } from './Input';
import { colors, ui } from '../styles';
import { PositionalAudio as ThreePositionalAudio } from 'three';
import { useAudioListener } from '../AudioRuntime';
import { withBasePath } from '../runtimeUtils';
import { usePrefab } from '../SceneContext';
import { useEditorRef } from '../EditorContext';
import { SoundPicker } from '../../assetviewer/page';

type ClipMode = 'single' | 'random' | 'sequence';

type SoundProperties = {
    clips?: string[];
    eventName?: string;
    autoplay?: boolean;
    loop?: boolean;
    clipMode?: ClipMode;
    positional?: boolean;
    refDistance?: number;
    maxDistance?: number;
    rolloffFactor?: number;
    distanceModel?: 'linear' | 'inverse' | 'exponential';
    pitch?: number;
    randomizePitch?: boolean;
    minPitch?: number;
    maxPitch?: number;
    volume?: number;
    randomizeVolume?: boolean;
    minVolume?: number;
    maxVolume?: number;
};

const CLIP_MODE_OPTIONS = [
    { value: 'single', label: 'Single Clip' },
    { value: 'random', label: 'Random Clip' },
    { value: 'sequence', label: 'Sequence' },
] as const;

function normalizeClips(clips?: string[]) {
    return (clips ?? []).map(clip => clip.trim()).filter(Boolean);
}

function clampRange(min: number | undefined, max: number | undefined, fallbackMin: number, fallbackMax: number) {
    const safeMin = Number.isFinite(min) ? Number(min) : fallbackMin;
    const safeMax = Number.isFinite(max) ? Number(max) : fallbackMax;
    return safeMin <= safeMax ? [safeMin, safeMax] as const : [safeMax, safeMin] as const;
}

function sampleRange(min: number, max: number) {
    return min + Math.random() * (max - min);
}

function getPitchValue(properties: SoundProperties) {
    if (properties.randomizePitch) {
        const [pitchFloor, pitchCeiling] = clampRange(properties.minPitch, properties.maxPitch, 0.96, 1.04);
        return sampleRange(pitchFloor, pitchCeiling);
    }

    return Number.isFinite(properties.pitch) ? Number(properties.pitch) : 1;
}

function getVolumeValue(properties: SoundProperties) {
    if (properties.randomizeVolume) {
        const [volumeFloor, volumeCeiling] = clampRange(properties.minVolume, properties.maxVolume, 0.9, 1);
        return sampleRange(volumeFloor, volumeCeiling);
    }

    return Number.isFinite(properties.volume) ? Number(properties.volume) : 1;
}

function resolveClipPaths({ clips, clipMode }: SoundProperties) {
    const normalizedClips = normalizeClips(clips);
    if (normalizedClips.length > 0) {
        return { paths: normalizedClips, mode: clipMode ?? 'random' };
    }

    return { paths: [], mode: 'single' as const };
}

function pickClip(paths: string[], mode: ClipMode, sequenceIndexRef: React.MutableRefObject<number>) {
    if (paths.length <= 1 || mode === 'single') {
        return paths[0];
    }

    if (mode === 'sequence') {
        const clip = paths[sequenceIndexRef.current % paths.length];
        sequenceIndexRef.current += 1;
        return clip;
    }

    return paths[Math.floor(Math.random() * paths.length)];
}

function payloadMatchesNode(nodeId: string | undefined, payload: unknown) {
    if (!nodeId || !payload || typeof payload !== 'object') {
        return true;
    }

    const eventPayload = payload as NodePointerEventPayload & ContactEventPayload;
    const relatedNodeIds = [
        eventPayload.nodeId,
        eventPayload.sourceEntityId,
        eventPayload.sourceNodeId,
        eventPayload.targetEntityId,
        eventPayload.targetNodeId,
        eventPayload.instanceEntityId,
    ].filter((value): value is string => typeof value === 'string');

    return relatedNodeIds.length > 0 ? relatedNodeIds.includes(nodeId) : true;
}

function playBufferedAudio(audio: ThreePositionalAudio, buffer: AudioBuffer, properties: SoundProperties) {
    void audio.listener.context.resume();

    if (audio.isPlaying) {
        audio.stop();
    }

    audio.setBuffer(buffer);
    audio.setLoop(Boolean(properties.loop));
    audio.setPlaybackRate(getPitchValue(properties));
    audio.setVolume(getVolumeValue(properties));
    audio.play();
}

function SoundComponentEditor({ properties, update }: ComponentEditorProps<SoundProperties>) {
    const { basePath } = useEditorRef();
    const clips = Array.isArray(properties.clips)
        ? properties.clips.map((clip: unknown) => typeof clip === 'string' ? clip : '')
        : [];
    const randomizePitch = Boolean(properties.randomizePitch);
    const randomizeVolume = Boolean(properties.randomizeVolume);
    const positional = Boolean(properties.positional);

    const setClips = (nextClips: string[]) => {
        update({ clips: nextClips });
    };

    const addClip = () => {
        setClips([...clips, '']);
    };

    const updateClip = (index: number, nextPath: string) => {
        const nextClips = [...clips];
        nextClips[index] = nextPath;
        setClips(nextClips);
    };

    const removeClip = (index: number) => {
        setClips(clips.filter((_, clipIndex) => clipIndex !== index));
    };

    return (
        <FieldGroup>
            <StringField
                name="eventName"
                label="Listen Event"
                values={properties}
                onChange={update}
                placeholder="player:footstep"
            />
            <BooleanField name="autoplay" label="Autoplay" values={properties} onChange={update} fallback={false} />
            <BooleanField name="loop" label="Loop" values={properties} onChange={update} fallback={false} />
            <FieldRenderer
                fields={[
                    {
                        name: 'clipMode',
                        label: 'Clip Mode',
                        type: 'select',
                        options: CLIP_MODE_OPTIONS.map(option => ({ value: option.value, label: option.label })),
                    },
                ]}
                values={properties}
                onChange={update}
            />
            <ListEditor
                label="Clips"
                items={clips}
                onAdd={addClip}
                emptyMessage="No clips added."
                addButtonTitle="Add clip"
                addDisabledTitle="Add clip"
                renderItem={(clip, index) => (
                    <div
                        key={`${clip}-${index}`}
                        style={{
                            ...ui.secondaryPanel,
                            display: 'flex',
                            gap: 6,
                            alignItems: 'end',
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <SoundPicker value={clip || undefined} onChange={(nextPath) => updateClip(index, nextPath ?? '')} basePath={basePath} />
                        </div>
                        <button
                            type="button"
                            onClick={() => removeClip(index)}
                            style={{
                                ...ui.compactActionButton,
                                height: 24,
                                background: colors.bgInput,
                            }}
                            title="Remove clip"
                        >
                            ×
                        </button>
                    </div>
                )}
            />
            <BooleanField name="positional" label="Positional" values={properties} onChange={update} fallback={false} />
            {positional ? (
                <>
                    <NumberField name="refDistance" label="Ref Distance" values={properties} onChange={update} fallback={1} min={0.01} step={0.1} />
                    <NumberField name="maxDistance" label="Max Distance" values={properties} onChange={update} fallback={24} min={0.01} step={0.1} />
                    <NumberField name="rolloffFactor" label="Rolloff" values={properties} onChange={update} fallback={1} min={0} step={0.1} />
                    <SelectField
                        name="distanceModel"
                        label="Distance Model"
                        values={properties}
                        onChange={update}
                        fallback="inverse"
                        options={[
                            { value: 'inverse', label: 'Inverse' },
                            { value: 'linear', label: 'Linear' },
                            { value: 'exponential', label: 'Exponential' },
                        ]}
                    />
                </>
            ) : null}
            <BooleanField name="randomizePitch" label="Random Pitch" values={properties} onChange={update} fallback={false} />
            {randomizePitch ? (
                <>
                    <NumberField name="minPitch" label="Min Pitch" values={properties} onChange={update} fallback={0.96} step={0.01} min={0.1} />
                    <NumberField name="maxPitch" label="Max Pitch" values={properties} onChange={update} fallback={1.04} step={0.01} min={0.1} />
                </>
            ) : (
                <NumberField name="pitch" label="Pitch" values={properties} onChange={update} fallback={1} step={0.01} min={0.1} />
            )}
            <BooleanField name="randomizeVolume" label="Random Volume" values={properties} onChange={update} fallback={false} />
            {randomizeVolume ? (
                <>
                    <NumberField name="minVolume" label="Min Volume" values={properties} onChange={update} fallback={0.9} step={0.01} min={0} />
                    <NumberField name="maxVolume" label="Max Volume" values={properties} onChange={update} fallback={1} step={0.01} min={0} />
                </>
            ) : (
                <NumberField name="volume" label="Volume" values={properties} onChange={update} fallback={1} step={0.01} min={0} />
            )}
        </FieldGroup>
    );
}

function SoundComponentView({ properties, children }: ComponentViewProps<SoundProperties>) {
    const { basePath } = usePrefab();
    const { getSound } = useAssetRuntime();
    const { editMode, nodeId } = useNode();
    const listener = useAudioListener();
    const { eventName, autoplay = false, positional = false, refDistance = 1, maxDistance = 24, rolloffFactor = 1, distanceModel = 'inverse' } = properties;
    const sequenceIndexRef = useRef(0);
    const positionalAudioRef = useRef<ThreePositionalAudio | null>(null);
    const { paths, mode } = useMemo(() => {
        const resolved = resolveClipPaths(properties);
        return { ...resolved, paths: resolved.paths.map(path => withBasePath(basePath, path)) };
    },
        [basePath, properties.clips, properties.clipMode],
    );
    const soundAssetRevision = useSoundAssetRevision(paths);

    useEffect(() => {
        const audio = positionalAudioRef.current;
        if (!audio) {
            return;
        }

        audio.setRefDistance(positional ? refDistance : Math.max(refDistance, 1));
        audio.setMaxDistance(positional ? maxDistance : 1_000_000);
        audio.setRolloffFactor(positional ? rolloffFactor : 0);
        audio.setDistanceModel(positional ? distanceModel : 'inverse');
    }, [distanceModel, maxDistance, positional, refDistance, rolloffFactor]);

    useEffect(() => {
        if (editMode || paths.length === 0 || !eventName) {
            return;
        }

        return gameEvents.on(eventName, (payload) => {
            if (!payloadMatchesNode(nodeId, payload)) {
                return;
            }

            const clip = pickClip(paths, mode, sequenceIndexRef);
            if (!clip) return;

            const audio = positionalAudioRef.current;
            const buffer = getSound(clip);
            if (!audio || !buffer) {
                return;
            }

            playBufferedAudio(audio, buffer, properties);
        });
    }, [editMode, eventName, getSound, mode, nodeId, paths, properties]);

    useEffect(() => {
        // Re-run when assets load so autoplay can start once the buffer is ready
        // (the asset runtime context is now stable and no longer re-renders on load).
        void soundAssetRevision;
        if (editMode || !autoplay || paths.length === 0) {
            return;
        }

        const clip = pickClip(paths, mode, sequenceIndexRef);
        if (!clip) {
            return;
        }

        const audio = positionalAudioRef.current;
        const buffer = getSound(clip);
        if (!audio || !buffer) {
            return;
        }
        playBufferedAudio(audio, buffer, properties);

        return () => {
            if (audio.isPlaying) audio.stop();
        };
    }, [autoplay, editMode, getSound, mode, paths, properties, soundAssetRevision]);

    return (
        <>
            <positionalAudio ref={positionalAudioRef} args={[listener]} />
            {children}
        </>
    );
}

const SoundComponent: Component<SoundProperties> = {
    name: 'Sound',
    Editor: SoundComponentEditor,
    View: SoundComponentView,
    properties: {
        eventName: { type: 'string', default: '' },
        autoplay: { type: 'boolean', default: false },
        loop: { type: 'boolean', default: false },
        clips: { type: 'string[]', default: [] },
        clipMode: { type: 'select', default: 'single', options: CLIP_MODE_OPTIONS },
        positional: { type: 'boolean', default: false },
        refDistance: { default: 1 },
        maxDistance: { default: 24 },
        rolloffFactor: { default: 1 },
        distanceModel: {
            type: 'select',
            default: 'inverse',
            options: [
                { value: 'inverse', label: 'Inverse' },
                { value: 'linear', label: 'Linear' },
                { value: 'exponential', label: 'Exponential' },
            ],
        },
        pitch: { default: 1 },
        randomizePitch: { type: 'boolean', default: false },
        minPitch: { default: 0.96 },
        maxPitch: { default: 1.04 },
        volume: { default: 1 },
        randomizeVolume: { type: 'boolean', default: false },
        minVolume: { default: 0.9 },
        maxVolume: { default: 1 },
    },
};

export default SoundComponent;

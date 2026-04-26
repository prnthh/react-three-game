import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { SoundPicker } from '../../assetviewer/page';
import { useAssetRuntime, useNode } from '../assetRuntime';
import { gameEvents, type ClickEventPayload, type ContactEventPayload } from '../GameEvents';
import { Component } from './ComponentRegistry';
import { BooleanField, FieldGroup, FieldRenderer, ListEditor, NumberField, SelectField, StringField } from './Input';
import { colors, ui } from '../styles';
import type { ComponentData } from '../types';
import { AudioListener, PositionalAudio as ThreePositionalAudio } from 'three';

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

let sharedAudioListener: AudioListener | null = null;

function getSharedAudioListener() {
    if (!sharedAudioListener) {
        sharedAudioListener = new AudioListener();
    }

    return sharedAudioListener;
}

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

    const eventPayload = payload as ClickEventPayload & ContactEventPayload;
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

function SoundComponentEditor({ component, onUpdate, basePath = '' }: { component: ComponentData; onUpdate: (newComp: any) => void; basePath?: string }) {
    const clips = Array.isArray(component.properties.clips)
        ? component.properties.clips.map((clip: unknown) => typeof clip === 'string' ? clip : '')
        : [];
    const randomizePitch = Boolean(component.properties.randomizePitch);
    const randomizeVolume = Boolean(component.properties.randomizeVolume);
    const positional = Boolean(component.properties.positional);

    const setClips = (nextClips: string[]) => {
        onUpdate({ clips: nextClips });
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
                values={component.properties}
                onChange={onUpdate}
                placeholder="player:footstep"
            />
            <BooleanField name="autoplay" label="Autoplay" values={component.properties} onChange={onUpdate} fallback={false} />
            <BooleanField name="loop" label="Loop" values={component.properties} onChange={onUpdate} fallback={false} />
            <FieldRenderer
                fields={[
                    {
                        name: 'clipMode',
                        label: 'Clip Mode',
                        type: 'select',
                        options: CLIP_MODE_OPTIONS.map(option => ({ value: option.value, label: option.label })),
                    },
                ]}
                values={component.properties}
                onChange={onUpdate}
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
            <BooleanField name="positional" label="Positional" values={component.properties} onChange={onUpdate} fallback={false} />
            {positional ? (
                <>
                    <NumberField name="refDistance" label="Ref Distance" values={component.properties} onChange={onUpdate} fallback={1} min={0.01} step={0.1} />
                    <NumberField name="maxDistance" label="Max Distance" values={component.properties} onChange={onUpdate} fallback={24} min={0.01} step={0.1} />
                    <NumberField name="rolloffFactor" label="Rolloff" values={component.properties} onChange={onUpdate} fallback={1} min={0} step={0.1} />
                    <SelectField
                        name="distanceModel"
                        label="Distance Model"
                        values={component.properties}
                        onChange={onUpdate}
                        fallback="inverse"
                        options={[
                            { value: 'inverse', label: 'Inverse' },
                            { value: 'linear', label: 'Linear' },
                            { value: 'exponential', label: 'Exponential' },
                        ]}
                    />
                </>
            ) : null}
            <BooleanField name="randomizePitch" label="Random Pitch" values={component.properties} onChange={onUpdate} fallback={false} />
            {randomizePitch ? (
                <>
                    <NumberField name="minPitch" label="Min Pitch" values={component.properties} onChange={onUpdate} fallback={0.96} step={0.01} min={0.1} />
                    <NumberField name="maxPitch" label="Max Pitch" values={component.properties} onChange={onUpdate} fallback={1.04} step={0.01} min={0.1} />
                </>
            ) : (
                <NumberField name="pitch" label="Pitch" values={component.properties} onChange={onUpdate} fallback={1} step={0.01} min={0.1} />
            )}
            <BooleanField name="randomizeVolume" label="Random Volume" values={component.properties} onChange={onUpdate} fallback={false} />
            {randomizeVolume ? (
                <>
                    <NumberField name="minVolume" label="Min Volume" values={component.properties} onChange={onUpdate} fallback={0.9} step={0.01} min={0} />
                    <NumberField name="maxVolume" label="Max Volume" values={component.properties} onChange={onUpdate} fallback={1} step={0.01} min={0} />
                </>
            ) : (
                <NumberField name="volume" label="Volume" values={component.properties} onChange={onUpdate} fallback={1} step={0.01} min={0} />
            )}
        </FieldGroup>
    );
}

function SoundComponentView({ properties, children }: { properties: SoundProperties; children?: React.ReactNode }) {
    const { getSound } = useAssetRuntime();
    const { editMode, nodeId } = useNode();
    const { camera } = useThree();
    const { eventName, autoplay = false, positional = false, refDistance = 1, maxDistance = 24, rolloffFactor = 1, distanceModel = 'inverse' } = properties;
    const sequenceIndexRef = useRef(0);
    const listenerRef = useRef<AudioListener | null>(null);
    const positionalAudioRef = useRef<ThreePositionalAudio | null>(null);
    const { paths, mode } = resolveClipPaths(properties);

    if (!listenerRef.current) {
        listenerRef.current = getSharedAudioListener();
    }

    useEffect(() => {
        const listener = listenerRef.current;
        if (!listener) {
            return;
        }

        if (listener.parent !== camera) {
            listener.parent?.remove(listener);
            camera.add(listener);
        }

        return () => {
            if (listener.parent === camera) {
                camera.remove(listener);
            }
        };
    }, [camera]);

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
            if (audio?.isPlaying) {
                audio.stop();
            }
        };
    }, [autoplay, editMode, getSound, mode, paths, properties]);

    return (
        <>
            {listenerRef.current ? <positionalAudio ref={positionalAudioRef} args={[listenerRef.current]} /> : null}
            {children}
        </>
    );
}

const SoundComponent: Component = {
    name: 'Sound',
    Editor: SoundComponentEditor,
    View: SoundComponentView,
    defaultProperties: {
        eventName: '',
        autoplay: false,
        loop: false,
        clips: [],
        clipMode: 'single',
        positional: false,
        refDistance: 1,
        maxDistance: 24,
        rolloffFactor: 1,
        distanceModel: 'inverse',
        pitch: 1,
        randomizePitch: false,
        minPitch: 0.96,
        maxPitch: 1.04,
        volume: 1,
        randomizeVolume: false,
        minVolume: 0.9,
        maxVolume: 1,
    },
    getAssetRefs: (properties) => {
        const refs: { type: 'sound'; path: string }[] = [];
        if (Array.isArray(properties.clips)) {
            properties.clips.forEach((clip: unknown) => {
                if (typeof clip === 'string' && clip.trim().length > 0) {
                    refs.push({ type: 'sound', path: clip });
                }
            });
        }
        return refs;
    },
};

export default SoundComponent;
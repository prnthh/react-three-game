import { meshRenderProperties, type MeshRenderProperties } from "../rendering/meshProperties.js";
import { useModelMeshSettings } from "../rendering/useModelMeshSettings.js";
import { AssetBoundary } from '../assets/AssetBoundary.js';
import { usePrefabStoreApi } from '../prefabs/PrefabStoreContext.js';
import { useFrame } from '@react-three/fiber';

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { AnimationMixer, LoopRepeat, type Bone, type SkinnedMesh, type AnimationAction, type AnimationClip, type Object3D } from 'three';

import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { useModelAsset } from '../assets/AssetRuntime.js';

import { createNodeComponentType, usePrefab, useRegisterNodeComponent } from '../scene/SceneContext.js';

import { withBasePath } from "../assets/assetPaths.js";

import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';

export interface SkinnedMeshHandle {
    readonly object: Object3D;
    readonly bones: readonly Bone[];
    getBone(name: string): Bone | null;
    /** This model instance's mixer. Disable autoUpdate when advancing it yourself. */
    readonly mixer: AnimationMixer;
    readonly animations: readonly AnimationClip[];
    readonly animationStates: readonly string[];
    readonly animationState: string;
    /** Existing clip action, matched case-insensitively; null for an unknown name. */
    getAction(name: string): AnimationAction | null;
    setAnimationState(state: string, immediate?: boolean): void;
    stop(): void;
    update(delta: number): void;
}

export const SKINNED_MESH_COMPONENT = createNodeComponentType<SkinnedMeshHandle>('SkinnedMesh');

export type SkinnedMeshProperties = MeshRenderProperties & {
    filename?: string;
    animationState?: string;
    fadeDuration?: number;
    autoUpdate?: boolean;
};

function findAction(state: string, clips: readonly AnimationClip[], actions: readonly AnimationAction[]) {
    const normalized = state.trim().toLowerCase();
    if (!normalized) return null;
    for (let index = 0; index < clips.length; index += 1) {
        if (clips[index].name.toLowerCase() === normalized) return actions[index] ?? null;
    }
    return null;
}

function AutoAnimationUpdate({ mixer }: { mixer: AnimationMixer }) {
    useFrame((_, delta) => mixer.update(delta));
    return null;
}

export interface SkinnedModelOptions {
    animations?: readonly AnimationClip[];
    fadeDuration?: number;
    /** Configure only the owned clone, before its mixer and bone lookup are created. */
    prepare?: (object: Object3D) => void;
}

/** Shared instance ownership for SkinnedMesh and custom game presenters. */
export function useSkinnedModel(source: Object3D | null, options: SkinnedModelOptions = {}): SkinnedMeshHandle | null {
    const currentActionRef = useRef<AnimationAction | null>(null);
    const stateRef = useRef('');
    const object = useMemo(() => {
        if (!source) return null;
        const clone = cloneSkeleton(source);
        options.prepare?.(clone);
        return clone;
    }, [source, options.prepare]);
    const bones = useMemo(() => {
        const result = new Map<string, Bone>();
        object?.traverse(part => { if ((part as Bone).isBone) result.set(part.name, part as Bone); });
        return result;
    }, [object]);
    const clips = options.animations ?? source?.animations ?? EMPTY_CLIPS;
    const mixer = useMemo(() => object ? new AnimationMixer(object) : null, [object]);
    const actions = useMemo(() => {
        if (!mixer || !object) return [];
        const next = new Array<AnimationAction>(clips.length);
        for (let index = 0; index < clips.length; index += 1) {
            next[index] = mixer.clipAction(clips[index], object).setLoop(LoopRepeat, Infinity);
        }
        return next;
    }, [clips, mixer, object]);
    const stop = useCallback(() => {
        mixer?.stopAllAction();
        currentActionRef.current = null;
        stateRef.current = '';
    }, [mixer]);
    const setAnimationState = useCallback((state: string, immediate = false) => {
        const next = findAction(state, clips, actions);
        const previous = currentActionRef.current;
        if (!next) {
            previous?.stop();
            currentActionRef.current = null;
            stateRef.current = '';
            return;
        }
        stateRef.current = next.getClip().name;
        if (next === previous && next.isRunning() && !immediate) return;
        const fadeDuration = Math.max(0, options.fadeDuration ?? 0.18);
        if (immediate) previous?.stop();
        else if (previous && previous !== next) previous.fadeOut(fadeDuration);
        next.reset().setEffectiveWeight(1);
        if (!immediate && fadeDuration > 0) next.fadeIn(fadeDuration);
        next.play();
        currentActionRef.current = next;
    }, [actions, clips, options.fadeDuration]);
    const handle = useMemo<SkinnedMeshHandle | null>(() => object && mixer ? ({
        object,
        bones: [...bones.values()],
        getBone: name => bones.get(name) ?? null,
        mixer,
        animations: clips,
        animationStates: clips.map(clip => clip.name),
        get animationState() { return stateRef.current; },
        getAction: name => findAction(name, clips, actions),
        setAnimationState,
        stop,
        update: delta => mixer.update(delta),
    }) : null, [actions, bones, clips, mixer, object, setAnimationState, stop]);

    useEffect(() => () => {
        if (!object || !mixer) return;
        mixer.stopAllAction();
        // Keep bindings reusable during React effect replay; the owned mixer
        // and its action cache are collected with the instance on final unmount.
        const skeletons = new Set<SkinnedMesh['skeleton']>();
        object.traverse(part => { if ((part as SkinnedMesh).isSkinnedMesh) skeletons.add((part as SkinnedMesh).skeleton); });
        skeletons.forEach(skeleton => skeleton.dispose());
    }, [object, mixer]);
    return handle;
}
const EMPTY_CLIPS: readonly AnimationClip[] = [];

function LoadedSkinnedMesh({ properties, enabled, path }: { properties: SkinnedMeshProperties; enabled: boolean; path: string }) {
    const source = useModelAsset(path);
    const handle = useSkinnedModel(source, { fadeDuration: properties.fadeDuration });
    useModelMeshSettings(handle?.object ?? null, properties, false);
    useRegisterNodeComponent(SKINNED_MESH_COMPONENT, handle);
    useEffect(() => {
        if (!handle) return;
        handle.setAnimationState(properties.animationState ?? handle.animations[0]?.name ?? '', true);
        handle.update(0);
    }, [handle, properties.animationState]);
    if (!handle) return null;
    return <>
        <group visible={properties.visible !== false}><primitive object={handle.object} dispose={null} /></group>
        {enabled && properties.autoUpdate !== false ? <AutoAnimationUpdate mixer={handle.mixer} /> : null}
    </>;
}

function SkinnedMeshView({ properties, enabled, children }: ComponentViewProps<SkinnedMeshProperties>) {
    const { basePath } = usePrefab();
    const store = usePrefabStoreApi();
    const resolvedFilename = properties.filename ? withBasePath(basePath, properties.filename) : '';
    return <>
        {resolvedFilename ? <AssetBoundary subscribeToRetry={store.subscribe}><LoadedSkinnedMesh properties={properties} enabled={enabled} path={resolvedFilename} /></AssetBoundary> : null}
        {children}
    </>;
}

const SkinnedMeshComponent: Component<SkinnedMeshProperties> = {
    dependencies: properties => properties.filename ? [{ kind: 'model', path: properties.filename }] : [],
    name: 'SkinnedMesh',
    category: 'mesh',
    renderWhenDisabled: true,
    description: "Load a model with skeletal animation. Set filename and animationState to a clip name from the asset; each instance has its own skeleton and animation mixer.",
    slot: 'object',
    View: SkinnedMeshView,
    properties: {
        ...meshRenderProperties,
        filename: { description: "Model asset path relative to basePath, or an absolute URL.", type: 'string', default: '' },
        animationState: { description: "Animation clip name from the loaded model; empty or unknown names stop playback.", type: 'string', default: '' },
        fadeDuration: { description: "Crossfade time in seconds when switching clips.", default: 0.18 },
        frustumCulled: { type: 'boolean', default: false },
        autoUpdate: { description: "Advance the animation mixer on R3F frames. Disable only when application code advances it.", type: 'boolean', default: true },
    },
};

export default SkinnedMeshComponent;

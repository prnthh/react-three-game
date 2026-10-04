import { meshRenderProperties, type MeshRenderProperties } from "../rendering/meshProperties.js";
import { useModelMeshSettings } from "../rendering/useModelMeshSettings.js";
import { AssetBoundary } from '../assets/AssetBoundary.js';
import { usePrefabStoreApi } from '../prefabs/PrefabStoreContext.js';
import { useFrame } from '@react-three/fiber';

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { AnimationMixer, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from 'three';

import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { useModelAsset } from '../assets/AssetRuntime.js';

import { createNodeComponentType, usePrefab, useRegisterNodeComponent } from '../scene/SceneContext.js';

import { withBasePath } from "../assets/assetPaths.js";

import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';

export interface SkinnedMeshHandle {
    readonly object: Object3D;
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

function LoadedSkinnedMesh({ properties, enabled, path }: { properties: SkinnedMeshProperties; enabled: boolean; path: string }) {
    const source = useModelAsset(path);
    const currentActionRef = useRef<AnimationAction | null>(null);
    const stateRef = useRef(properties.animationState ?? '');
    const object = useMemo(() => source ? cloneSkeleton(source) : null, [source]);
    useModelMeshSettings(object, properties, false);
    const clips = source?.animations ?? [];
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
        const fadeDuration = Math.max(0, properties.fadeDuration ?? 0.18);
        if (immediate) previous?.stop();
        else if (previous && previous !== next) previous.fadeOut(fadeDuration);
        next.reset().setEffectiveWeight(1);
        if (!immediate && fadeDuration > 0) next.fadeIn(fadeDuration);
        next.play();
        currentActionRef.current = next;
    }, [actions, clips, properties.fadeDuration]);
    const handle = useMemo<SkinnedMeshHandle | null>(() => object && mixer ? ({
        object,
        mixer,
        animations: clips,
        animationStates: clips.map(clip => clip.name),
        get animationState() { return stateRef.current; },
        getAction: name => findAction(name, clips, actions),
        setAnimationState,
        stop,
        update: delta => mixer.update(delta),
    }) : null, [actions, clips, mixer, object, setAnimationState, stop]);

    useRegisterNodeComponent(SKINNED_MESH_COMPONENT, handle);
    useEffect(() => {
        if (!handle) return;
        handle.setAnimationState(properties.animationState ?? clips[0]?.name ?? '', true);
        handle.update(0);
    }, [clips, handle, properties.animationState]);
    useEffect(() => () => { mixer?.stopAllAction(); }, [mixer]);
    if (!object || !mixer) return null;
    return <>
        <group visible={properties.visible !== false}><primitive object={object} /></group>
        {enabled && properties.autoUpdate !== false ? <AutoAnimationUpdate mixer={mixer} /> : null}
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
    description: 'Loads a model with cloned skeletons and one animation mixer per instance.',
    renderWhenDisabled: true,
    slot: 'object',
    View: SkinnedMeshView,
    properties: {
        ...meshRenderProperties,
        filename: { type: 'string', default: '' },
        animationState: { type: 'string', default: '' },
        fadeDuration: { default: 0.18 },
        frustumCulled: { type: 'boolean', default: false },
        autoUpdate: { type: 'boolean', default: true },
    },
};

export default SkinnedMeshComponent;

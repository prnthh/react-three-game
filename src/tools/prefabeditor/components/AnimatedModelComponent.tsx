import { useFrame } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { AnimationMixer, LoopRepeat, Mesh, type AnimationAction, type AnimationClip, type Object3D } from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { useSuspenseModelAsset } from '../assetRuntime';
import { createNodeComponentType, usePrefab, useRegisterNodeComponent } from '../SceneContext';
import { useEditorRef } from '../EditorContext';
import { withBasePath } from '../runtimeUtils';
import type { Component, ComponentEditorProps, ComponentViewProps } from './ComponentRegistry';
import { BooleanField, FieldGroup, NumberField, StringField } from './Input';
import { ModelPicker } from '../../assetviewer/page';

export interface AnimatedModelHandle {
    readonly object: Object3D;
    readonly animations: readonly AnimationClip[];
    readonly animationStates: readonly string[];
    readonly animationState: string;
    setAnimationState(state: string, immediate?: boolean): void;
    stop(): void;
    update(delta: number): void;
}

export const ANIMATED_MODEL_COMPONENT = createNodeComponentType<AnimatedModelHandle>('AnimatedModel');

export type AnimatedModelProperties = {
    filename?: string;
    animationState?: string;
    fadeDuration?: number;
    castShadow?: boolean;
    receiveShadow?: boolean;
    frustumCulled?: boolean;
    autoUpdate?: boolean;
    emitClickEvent?: boolean;
    clickEventName?: string;
};

function findAction(state: string, clips: readonly AnimationClip[], actions: readonly AnimationAction[]) {
    const normalized = state.trim().toLowerCase();
    if (!normalized) return null;
    for (let index = 0; index < clips.length; index += 1) {
        if (clips[index].name.toLowerCase() === normalized) return actions[index] ?? null;
    }
    return null;
}

function AnimatedModelEditor({ node, properties, update }: ComponentEditorProps<AnimatedModelProperties>) {
    const { basePath } = useEditorRef();
    return <FieldGroup>
        <ModelPicker value={properties.filename} onChange={filename => update({ filename })} basePath={basePath} pickerKey={node.id} />
        <StringField name="animationState" label="Animation State" values={properties} onChange={update} />
        <NumberField name="fadeDuration" label="Fade Duration" values={properties} onChange={update} fallback={0.18} min={0} step={0.05} />
        <BooleanField name="castShadow" label="Cast Shadow" values={properties} onChange={update} fallback />
        <BooleanField name="receiveShadow" label="Receive Shadow" values={properties} onChange={update} fallback />
        <BooleanField name="frustumCulled" label="Frustum Culling" values={properties} onChange={update} fallback={false} />
        <BooleanField name="autoUpdate" label="Auto Update" values={properties} onChange={update} fallback />
        <BooleanField name="emitClickEvent" label="Emit Click Event" values={properties} onChange={update} fallback={false} />
        {properties.emitClickEvent ? (
            <StringField name="clickEventName" label="Click Event Name" values={properties} onChange={update} placeholder="node:click" />
        ) : null}
    </FieldGroup>;
}

function AutoAnimationUpdate({ mixer }: { mixer: AnimationMixer }) {
    useFrame((_, delta) => mixer.update(delta));
    return null;
}

function LoadedAnimatedModel({ properties, enabled, path }: { properties: AnimatedModelProperties; enabled: boolean; path: string }) {
    const source = useSuspenseModelAsset(path);
    const currentActionRef = useRef<AnimationAction | null>(null);
    const stateRef = useRef(properties.animationState ?? '');
    const object = useMemo(() => {
        if (!source) return null;
        const clone = cloneSkeleton(source);
        clone.traverse(candidate => {
            if (!(candidate instanceof Mesh)) return;
            candidate.castShadow = properties.castShadow ?? true;
            candidate.receiveShadow = properties.receiveShadow ?? true;
            candidate.frustumCulled = properties.frustumCulled ?? false;
        });
        return clone;
    }, [properties.castShadow, properties.frustumCulled, properties.receiveShadow, source]);
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
    const handle = useMemo<AnimatedModelHandle | null>(() => object && mixer ? ({
        object,
        animations: clips,
        animationStates: clips.map(clip => clip.name),
        get animationState() { return stateRef.current; },
        setAnimationState,
        stop,
        update: delta => mixer.update(delta),
    }) : null, [clips, mixer, object, setAnimationState, stop]);

    useRegisterNodeComponent(ANIMATED_MODEL_COMPONENT, handle);
    useEffect(() => {
        if (!handle) return;
        handle.setAnimationState(properties.animationState ?? clips[0]?.name ?? '', true);
        handle.update(0);
    }, [clips, handle, properties.animationState]);
    useEffect(() => () => { mixer?.stopAllAction(); }, [mixer]);
    if (!object || !mixer) return null;
    return <>
        <primitive object={object} />
        {enabled && properties.autoUpdate !== false ? <AutoAnimationUpdate mixer={mixer} /> : null}
    </>;
}

function AnimatedModelView({ properties, enabled, children }: ComponentViewProps<AnimatedModelProperties>) {
    const { basePath } = usePrefab();
    const resolvedFilename = properties.filename ? withBasePath(basePath, properties.filename) : '';
    return <>
        {resolvedFilename ? <Suspense fallback={null}><LoadedAnimatedModel properties={properties} enabled={enabled} path={resolvedFilename} /></Suspense> : null}
        {children}
    </>;
}

const AnimatedModelComponent: Component<AnimatedModelProperties> = {
    name: 'AnimatedModel',
    Editor: AnimatedModelEditor,
    renderWhenDisabled: true,
    attach: 'object',
    View: AnimatedModelView,
    properties: {
        filename: { type: 'string', default: '' },
        animationState: { type: 'string', default: '' },
        fadeDuration: { default: 0.18 },
        castShadow: { type: 'boolean', default: true },
        receiveShadow: { type: 'boolean', default: true },
        frustumCulled: { type: 'boolean', default: false },
        autoUpdate: { type: 'boolean', default: true },
        emitClickEvent: { type: 'boolean', default: false },
        clickEventName: { type: 'string', default: '' },
    },
};

export default AnimatedModelComponent;

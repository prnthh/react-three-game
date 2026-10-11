import { createContext, createRef, useContext, useLayoutEffect, useRef } from 'react';
import { createPortal, useThree } from '@react-three/fiber';
import { CapsuleGeometry, MeshStandardMaterial, type Group } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { useNode, useSharedGeometryResource, useSharedMaterialResource, type Component, type ComponentViewProps } from 'react-three-game/viewer';
import { PLAYER_RADIUS } from '../collision';
import { STANDING_HEIGHT, type ParkourState } from '../movement';

export function createVisualRig() {
    return { root: createRef<Group>(), pose: createRef<Group>(), joints: new Map<string, Group>(), phase: 0, weight: 0 };
}
type VisualRig = ReturnType<typeof createVisualRig>;

/** Advance from physics ticks so live and replay use the same gait at any render rate. */
export function stepVisualGait(rig: VisualRig, state: ParkourState, delta: number) {
    const speed = Math.hypot(...state.velocity);
    const running = state.grounded && !state.crouched && speed > 0.5;
    if (running) rig.phase = (rig.phase + Math.min(speed, 18) * delta * Math.PI / 3) % (Math.PI * 2);
    const target = running ? Math.min(1, speed / 8) : 0;
    rig.weight += (target - rig.weight) * (1 - Math.exp(-12 * delta));
    poseVisualGait(rig);
}

function poseVisualGait(rig: VisualRig) {
    for (const side of ['left', 'right']) {
        const swing = Math.sin(rig.phase) * (side === 'left' ? 1 : -1);
        const arm = rig.joints.get(`${side}-arm`);
        const elbow = rig.joints.get(`${side}-forearm`);
        const leg = rig.joints.get(`${side}-leg`);
        if (arm) arm.rotation.x = rig.weight * swing * 0.65;
        if (elbow) elbow.rotation.x = 0.15 + rig.weight * (0.9 + swing * 0.25);
        if (leg) leg.rotation.x = -rig.weight * swing * 0.45;
    }
}

export function resetVisualGait(rig: VisualRig) {
    rig.phase = 0;
    rig.weight = 0;
    poseVisualGait(rig);
}
export const CharacterVisualsContext = createContext<{
    player: VisualRig; replay: VisualRig; color: string;
} | null>(null);
const RigContext = createContext<VisualRig | null>(null);

export function useCharacterVisuals() {
    const visuals = useContext(CharacterVisualsContext);
    if (!visuals) throw new Error('Character visuals must be children of ParkourCharacter');
    return visuals;
}

function VisualsView({ properties, children }: ComponentViewProps<{ replay: boolean }>) {
    const visuals = useCharacterVisuals();
    const { editMode } = useNode();
    const scene = useThree(state => state.scene);
    const rig = properties.replay ? visuals.replay : visuals.player;
    useLayoutEffect(() => {
        if (!editMode) return;
        rig.root.current?.quaternion.identity();
        rig.pose.current?.rotation.set(0, 0, 0);
        rig.pose.current?.position.set(0, STANDING_HEIGHT / 2, 0);
        resetVisualGait(rig);
    }, [editMode, rig]);
    const tree = <RigContext.Provider value={rig}>
        <group ref={rig.root} visible={!properties.replay || editMode} position={[properties.replay && editMode ? 3 : 0, 0, 0]}>
            <group ref={rig.pose} position={[0, STANDING_HEIGHT / 2, 0]}>{children}</group>
        </group>
    </RigContext.Provider>;
    // Replay follows world-space playback, independently of the live runner's transform.
    return properties.replay && !editMode ? createPortal(tree, scene) : tree;
}

export const CharacterVisualsComponent: Component<{ replay: boolean }> = {
    name: 'ParkourVisuals',
    description: 'Visible character parts. The controller poses this subtree independently of collision.',
    properties: { replay: { type: 'boolean', default: false } },
    View: VisualsView,
};

type PartProperties = { joint: string; shape: 'none' | 'capsule' | 'roundedBox'; radius: number; length: number; cornerRadius: number };

function PartView({ properties, children }: ComponentViewProps<PartProperties>) {
    const rig = useContext(RigContext);
    const pivot = useRef<Group>(null);
    useLayoutEffect(() => {
        if (!rig || !pivot.current || !properties.joint) return;
        const joint = pivot.current;
        rig.joints.set(properties.joint, joint);
        poseVisualGait(rig);
        return () => { if (rig.joints.get(properties.joint) === joint) rig.joints.delete(properties.joint); };
    }, [rig, properties.joint]);
    return <group ref={pivot}>
        {properties.shape !== 'none' && <PartMesh {...properties} />}
        {children}
    </group>;
}

function PartMesh({ shape, radius, length, cornerRadius }: PartProperties) {
    const visuals = useCharacterVisuals();
    const replay = useContext(RigContext) === visuals.replay;
    const color = replay ? '#67e8f9' : visuals.color;
    const geometry = useSharedGeometryResource(`parkour:body-part:${shape}:${radius}:${length}:${cornerRadius}`, () =>
        shape === 'roundedBox'
            ? new RoundedBoxGeometry(radius * 2, length + radius * 2, radius * 2, 3, cornerRadius)
            : new CapsuleGeometry(radius, length, 8, 16));
    const material = useSharedMaterialResource(`parkour:body:${replay}:${color}`, () => new MeshStandardMaterial({
        color, emissive: replay ? '#22d3ee' : '#000000', emissiveIntensity: replay ? 0.35 : 0,
        transparent: replay, opacity: replay ? 0.3 : 1, depthWrite: !replay,
    }));
    return <mesh castShadow={!replay} receiveShadow={!replay}>
        <primitive object={geometry} attach="geometry" dispose={null} />
        <primitive object={material} attach="material" dispose={null} />
    </mesh>;
}

export const CharacterPartComponent: Component<PartProperties> = {
    name: 'ParkourBodyPart',
    description: 'A visual part or joint pivot. Animation changes only X; set resting angles with Transform.',
    properties: {
        joint: { type: 'string', default: '', description: 'Optional animated joint: left/right-arm, left/right-forearm or left/right-leg.' },
        shape: { type: 'select', default: 'capsule', options: [{ label: 'Joint only', value: 'none' }, { label: 'Capsule', value: 'capsule' }, { label: 'Rounded box', value: 'roundedBox' }] },
        radius: { default: PLAYER_RADIUS, min: 0.01, step: 0.01 },
        length: { default: STANDING_HEIGHT - 2 * PLAYER_RADIUS, min: 0, step: 0.05 },
        cornerRadius: { default: 0.06, min: 0.01, step: 0.01, description: 'Corner rounding for rounded boxes.' },
    },
    View: PartView,
};

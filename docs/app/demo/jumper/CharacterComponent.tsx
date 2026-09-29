import { Html, PerspectiveCamera, PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MathUtils, PerspectiveCamera as AimCamera, Quaternion, Vector3 } from 'three';
import { useGameObject, useNode, useSceneComponents, type Component, type ComponentViewProps } from 'react-three-game/viewer';
import { JUMPER_SURFACE } from './SurfaceComponent';
import { cameraRoll } from './movement';
import { advanceJumper, createJumperSimulation, jumperRenderPosition, type JumperSimulation } from './timestep';

type Properties = { speed: number; jumpSpeed: number; jumpBoost: number; slideBoost: number; wallRunSpeed: number; color: string; playable: boolean };
function Controller(settings: Properties) {
    const object = useGameObject();
    const surfaces = useSceneComponents(JUMPER_SURFACE);
    const { gl } = useThree();
    // Controls own yaw/pitch. The rendered camera adds roll separately, so mouse look cannot erase it.
    const aim = useMemo(() => new AimCamera(), []);
    const camera = useRef<AimCamera>(null);
    const input = useRef({ keys: new Set<string>(), jump: false });
    const motion = useRef<JumperSimulation | null>(null);
    const [status, setStatus] = useState('Airborne');
    const [speedLabel, setSpeedLabel] = useState('0.0');
    const hudClock = useRef(0);
    const lastStatus = useRef('Airborne');
    const spawn = useRef(new Vector3());
    const forward = useRef(new Vector3());
    const position = useRef(new Vector3());
    const parentRotation = useRef(new Quaternion());
    const view = useRef({ yaw: 0, roll: 0, height: 1.6, fov: 75 });
    useEffect(() => {
        const clear = () => { input.current.keys.clear(); input.current.jump = false; if (motion.current) { motion.current.remainder = 0; motion.current.previous = motion.current.current; } };
        const keydown = (event: KeyboardEvent) => {
            if (document.pointerLockElement !== gl.domElement) return;
            if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ControlLeft', 'ControlRight', 'KeyC'].includes(event.code)) event.preventDefault();
            input.current.keys.add(event.code);
            if (event.code === 'Space' && !event.repeat) input.current.jump = true;
        };
        const keyup = (event: KeyboardEvent) => input.current.keys.delete(event.code);
        window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
        window.addEventListener('blur', clear); document.addEventListener('pointerlockchange', clear);
        return () => {
            window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
            window.removeEventListener('blur', clear); document.removeEventListener('pointerlockchange', clear);
            if (document.pointerLockElement === gl.domElement) document.exitPointerLock();
            if (object.transform && motion.current) {
                const local = spawn.current.clone(); object.transform.parent?.worldToLocal(local);
                object.transform.position.copy(local);
            }
        };
    }, [gl, object]);
    useFrame((_, frameDelta) => {
        const transform = object.transform;
        if (!transform || !camera.current) return;
        const delta = Math.min(frameDelta, 0.1);
        if (!motion.current) {
            transform.getWorldPosition(spawn.current);
            transform.getWorldQuaternion(aim.quaternion);
            motion.current = createJumperSimulation(spawn.current.toArray());
            aim.getWorldDirection(forward.current);
            view.current.yaw = Math.atan2(-forward.current.x, -forward.current.z);
        }
        aim.getWorldDirection(forward.current); forward.current.y = 0; forward.current.normalize();
        const locked = document.pointerLockElement === gl.domElement;
        if (locked) {
            const keys = input.current.keys;
            const ahead = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
            const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
            const bounds = surfaces.flatMap(s => { const b = s.value.bounds(); return b ? [b] : []; });
            const steps = advanceJumper(motion.current, frameDelta, {
                x: forward.current.x * ahead - forward.current.z * right,
                z: forward.current.z * ahead + forward.current.x * right,
                jump: input.current.jump, crouch: keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'),
            }, settings, bounds);
            if (steps) input.current.jump = false;
            if (motion.current.current.position[1] < -12) motion.current = createJumperSimulation(spawn.current.toArray());
            position.current.fromArray(jumperRenderPosition(motion.current));
            transform.parent?.worldToLocal(position.current);
            transform.position.copy(position.current);
        }
        const state = motion.current.current;
        hudClock.current += delta;
        if (hudClock.current >= 0.1) {
            hudClock.current = 0;
            setSpeedLabel(Math.hypot(...state.velocity).toFixed(1));
        }
        let nextStatus = 'Airborne';
        if (state.grounded) {
            nextStatus = state.crouched
                ? Math.hypot(...state.velocity) > 0.1 ? 'Sliding · Space to launch' : 'Crouched · Release to run'
                : 'Grounded · Ctrl / C to slide';
        }
        if (state.wallNormal) nextStatus = 'Wallrunning · Space to kick off';
        if (nextStatus !== lastStatus.current) { lastStatus.current = nextStatus; setStatus(nextStatus); }
        const yaw = Math.atan2(-forward.current.x, -forward.current.z);
        const turn = Math.atan2(Math.sin(yaw - view.current.yaw), Math.cos(yaw - view.current.yaw));
        const targetRoll = locked ? cameraRoll(turn / Math.max(delta, 0.001), state.wallNormal, forward.current.x, forward.current.z) : 0;
        view.current.yaw = yaw;
        view.current.roll = MathUtils.damp(view.current.roll, targetRoll, 9, delta);
        view.current.height = MathUtils.damp(view.current.height, state.crouched ? 0.8 : 1.6, 14, delta);
        view.current.fov = MathUtils.damp(view.current.fov, 75 + Math.min(8, Math.max(0, Math.hypot(...state.velocity) - settings.speed)), 5, delta);
        transform.getWorldQuaternion(parentRotation.current);
        camera.current.quaternion.copy(parentRotation.current.invert()).multiply(aim.quaternion);
        camera.current.rotateZ(view.current.roll);
        camera.current.position.y = view.current.height;
        camera.current.fov = view.current.fov; camera.current.updateProjectionMatrix();
    });
    return <>
        <PerspectiveCamera ref={camera} makeDefault position={[0, 1.6, 0]} fov={75} />
        <PointerLockControls camera={aim} domElement={gl.domElement} selector="#jumper-lock" />
        <Html fullscreen style={{ pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', bottom: 20, left: 20, color: 'white' }}>{status} · {speedLabel} m/s</div>
            <div style={{ position: 'absolute', top: '50%', left: '50%', color: 'white', opacity: 0.7 }}>·</div>
        </Html>
    </>;
}
function CharacterView({ properties, children }: ComponentViewProps<Properties>) {
    const { editMode } = useNode();
    return <>
        {properties.playable && !editMode ? <Controller {...properties} /> :
            <mesh position={[0, 0.9, 0]}><capsuleGeometry args={[0.3, 1.2, 4, 8]} /><meshStandardMaterial color={properties.color} /></mesh>}
        {children}
    </>;
}
export const CharacterComponent: Component<Properties> = {
    name: 'JumperCharacter', description: 'Roster character. Exactly one character should be playable. Movement stays in demo state.',
    properties: {
        speed: { default: 5, min: 1, max: 12, step: 0.5, description: 'Movement speed in world units per second.' },
        jumpSpeed: { default: 9, min: 1, max: 15, step: 0.5, description: 'Upward jump velocity.' },
        jumpBoost: { default: 2, min: 0, max: 6, step: 0.25, description: 'Forward speed added by ground and wall jumps.' },
        slideBoost: { default: 3, min: 0, max: 8, step: 0.25, description: 'One-shot speed boost when crouching while moving on the ground.' },
        wallRunSpeed: { default: 7, min: 1, max: 16, step: 0.5, description: 'Minimum speed along a wall while wallrunning.' },
        color: { type: 'color', default: '#38bdf8' },
        playable: { type: 'boolean', default: false },
    }, View: CharacterView,
};

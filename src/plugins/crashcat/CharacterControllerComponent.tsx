import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { capsule, kcc, type KCC } from 'crashcat';
import { Vector3, type PerspectiveCamera as Camera } from 'three';
import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';
import { useGameObject, useNode } from '../../runtime/scene/SceneContext.js';
import { useCrashcat } from './CrashcatRuntime.js';
import { getTerrainPhysicsStatus } from './TerrainPhysicsRuntime.js';

export type CharacterControllerProperties = { speed?: number; jumpSpeed?: number; radius?: number; height?: number };
function CharacterControllerView({ properties, enabled, children }: ComponentViewProps<CharacterControllerProperties>) {
    const editMode = useNode(node => node.editMode);
    const object = useGameObject();
    const api = useCrashcat();
    const scene = useThree(state => state.scene), canvas = useThree(state => state.gl.domElement);
    const camera = useRef<Camera>(null);
    const character = useRef<KCC | null>(null);
    const keys = useRef(new Set<string>());
    const hint = useRef<HTMLElement | null>(null);
    const view = useRef({ yaw: 0, pitch: 0, jump: false });
    const position = useMemo(() => new Vector3(), []);
    const settings = useMemo(() => kcc.createDefaultUpdateSettings(), []);
    const radius = Math.max(.1, properties.radius), height = Math.max(radius * 2, properties.height);
    const playing = enabled && !editMode;
    useEffect(() => {
        if (!playing || !api || !object.transform) return;
        object.transform.getWorldPosition(position);
        character.current = kcc.create({ shape: capsule.create({ radius, halfHeightOfCylinder: height / 2 - radius }),
            maxSlopeAngle: Math.PI / 4 }, [position.x, position.y, position.z], [0, 0, 0, 1]);
        view.current = { yaw: 0, pitch: 0, jump: false };
        return () => { character.current = null; keys.current.clear(); };
    }, [playing, api, object, radius, height, position]);
    useEffect(() => {
        if (!playing) return;
        const element = document.createElement('div');
        element.setAttribute('role', 'status');
        element.setAttribute('aria-label', 'Character controls');
        Object.assign(element.style, { position: 'absolute', left: '12px', bottom: '12px', maxWidth: '180px', padding: '8px',
            background: '#111c', color: 'white', fontSize: '12px', pointerEvents: 'none', borderRadius: '6px' });
        canvas.parentElement?.appendChild(element); hint.current = element;
        return () => { element.remove(); hint.current = null; };
    }, [playing, canvas]);
    useEffect(() => {
        if (!playing) return;
        let pointer: number | null = null, x = 0, y = 0;
        const onKey = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))) return;
            if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) return;
            event.preventDefault(); keys.current.add(event.code);
            if (event.code === 'Space' && !event.repeat) view.current.jump = true;
        };
        const onUp = (event: KeyboardEvent) => { keys.current.delete(event.code); };
        const release = () => { if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer); pointer = null; };
        const clear = () => { keys.current.clear(); view.current.jump = false; release(); };
        const down = (event: PointerEvent) => { if (event.button !== 0 || pointer !== null) return; pointer = event.pointerId; x = event.clientX; y = event.clientY; canvas.setPointerCapture(pointer); };
        const move = (event: PointerEvent) => {
            if (event.pointerId !== pointer) return;
            view.current.yaw -= (event.clientX - x) * .004;
            view.current.pitch = Math.max(-1.4, Math.min(1.4, view.current.pitch - (event.clientY - y) * .004));
            x = event.clientX; y = event.clientY;
        };
        window.addEventListener('keydown', onKey); window.addEventListener('keyup', onUp); window.addEventListener('blur', clear);
        canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
        return () => {
            clear(); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp); window.removeEventListener('blur', clear);
            canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
            canvas.removeEventListener('pointerup', release); canvas.removeEventListener('pointercancel', release);
        };
    }, [playing, canvas]);
    useFrame((_, delta) => {
        const actor = character.current, transform = object.transform;
        if (!playing || !api || !actor || !transform) return;
        const dt = Math.min(delta, .05);
        if (dt <= 0) return;
        if (keys.current.has('ArrowLeft')) view.current.yaw += dt * 1.8;
        if (keys.current.has('ArrowRight')) view.current.yaw -= dt * 1.8;
        camera.current?.rotation.set(view.current.pitch, view.current.yaw, 0, 'YXZ');
        const terrain = getTerrainPhysicsStatus(scene);
        const text = terrain && !terrain.ready ? 'Preparing nearby terrain…' : 'WASD / ↑↓ move · ←→ turn · Space jump · Drag to look';
        if (hint.current && hint.current.textContent !== text) hint.current.textContent = text;
        if (terrain && !terrain.ready) { actor.linearVelocity[1] = 0; return; }
        const forward = Number(keys.current.has('KeyW') || keys.current.has('ArrowUp')) - Number(keys.current.has('KeyS') || keys.current.has('ArrowDown'));
        const right = Number(keys.current.has('KeyD')) - Number(keys.current.has('KeyA'));
        const length = Math.max(1, Math.hypot(forward, right));
        const yaw = view.current.yaw, speed = Math.max(0, properties.speed) / length;
        actor.linearVelocity[0] = (right * Math.cos(yaw) - forward * Math.sin(yaw)) * speed;
        actor.linearVelocity[2] = (-right * Math.sin(yaw) - forward * Math.cos(yaw)) * speed;
        const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
        for (let i = 0; i < steps; i++) {
            const step = dt / steps;
            const supported = kcc.isSupported(actor);
            if (supported && actor.linearVelocity[1] < 0) actor.linearVelocity[1] = 0;
            if (supported && view.current.jump) actor.linearVelocity[1] = Math.max(0, properties.jumpSpeed);
            view.current.jump = false;
            actor.linearVelocity[1] -= 9.81 * step;
            kcc.update(api.world, actor, step, [0, -9.81, 0], settings, undefined, api.queryFilter);
        }
        position.fromArray(actor.position);
        transform.parent?.worldToLocal(position);
        transform.position.copy(position); transform.updateMatrixWorld(true);
    }, -2);
    return <>
        <PerspectiveCamera ref={camera} makeDefault={playing} position={[0, height / 2 - .15, 0]} fov={65} near={.05} far={2000} />
        <mesh visible={!!editMode}><capsuleGeometry args={[radius, height - 2 * radius, 4, 8]} /><meshBasicMaterial color="#44ccff" wireframe /></mesh>
        {children}
    </>;
}
export const CharacterControllerComponent: Component<CharacterControllerProperties> = {
    name: 'CharacterController', category: 'physics', renderWhenDisabled: true,
    description: 'Play-only first-person capsule controller. WASD moves, arrows turn/move, Space jumps, drag the canvas to look. Requires CrashcatRuntime.',
    View: CharacterControllerView,
    properties: { speed: { default: 8, min: 0 }, jumpSpeed: { default: 5, min: 0 }, radius: { default: .35, min: .1 }, height: { default: 1.8, min: .2 } },
};

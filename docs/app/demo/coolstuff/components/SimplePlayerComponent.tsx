import { PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { capsule, kcc } from 'crashcat';
import { useEffect, useMemo, useRef } from 'react';
import { Vector3, type PerspectiveCamera as Camera } from 'three';
import { useGameObject, useNode, type Component, type ComponentViewProps } from 'react-three-game/viewer';
import { useCrashcat } from 'react-three-game/plugins/crashcat';

type Properties = { speed: number; jumpSpeed: number; radius: number; height: number; sensitivity: number; pushForce: number };
const STEP = 1 / 60;
const GRAVITY: [number, number, number] = [0, -9.81, 0];

function Controller({ speed, jumpSpeed, radius, height, sensitivity, pushForce }: Properties) {
    const object = useGameObject();
    const physics = useCrashcat();
    const canvas = useThree(state => state.gl.domElement);
    const camera = useRef<Camera>(null);
    const character = useRef<ReturnType<typeof kcc.create> | null>(null);
    const input = useRef({ keys: new Set<string>(), jump: false });
    const clock = useRef(0);
    const position = useMemo(() => new Vector3(), []);
    const forward = useMemo(() => new Vector3(), []);
    const updateSettings = useMemo(() => kcc.createDefaultUpdateSettings(), []);

    useEffect(() => {
        const clear = () => { input.current.keys.clear(); input.current.jump = false; };
        const lock = () => { void canvas.requestPointerLock()?.catch(() => {}); };
        const keydown = (event: KeyboardEvent) => {
            if (document.pointerLockElement !== canvas || !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(event.code)) return;
            event.preventDefault();
            input.current.keys.add(event.code);
            if (event.code === 'Space' && !event.repeat) input.current.jump = true;
        };
        const keyup = (event: KeyboardEvent) => { input.current.keys.delete(event.code); };
        const look = (event: MouseEvent) => {
            if (document.pointerLockElement !== canvas || !camera.current) return;
            camera.current.rotation.order = 'YXZ';
            camera.current.rotation.y -= event.movementX * sensitivity;
            camera.current.rotation.x = Math.max(-1.5, Math.min(1.5, camera.current.rotation.x - event.movementY * sensitivity));
        };
        canvas.addEventListener('click', lock);
        document.addEventListener('keydown', keydown);
        document.addEventListener('keyup', keyup);
        document.addEventListener('mousemove', look);
        document.addEventListener('pointerlockchange', clear);
        window.addEventListener('blur', clear);
        return () => {
            canvas.removeEventListener('click', lock);
            document.removeEventListener('keydown', keydown);
            document.removeEventListener('keyup', keyup);
            document.removeEventListener('mousemove', look);
            document.removeEventListener('pointerlockchange', clear);
            window.removeEventListener('blur', clear);
            if (document.pointerLockElement === canvas) document.exitPointerLock();
        };
    }, [canvas, sensitivity]);

    useEffect(() => () => {
        if (physics && character.current) kcc.remove(physics.world, character.current);
        character.current = null;
        clock.current = 0;
    }, [physics, radius, height, pushForce]);

    useFrame((_, delta) => {
        const transform = object.transform;
        if (!physics || !transform || !camera.current) return;
        if (!character.current) {
            transform.getWorldPosition(position);
            const shape = capsule.create({ radius, halfHeightOfCylinder: Math.max(0, height / 2 - radius) });
            character.current = kcc.create({ shape, maxStrength: pushForce,
                innerRigidBody: { shape, objectLayer: physics.movingObjectLayer },
            }, position.toArray(), [0, 0, 0, 1]);
            kcc.add(physics.world, character.current);
        }
        const body = character.current;
        const keys = input.current.keys;
        const x = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
        const z = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
        camera.current.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const length = Math.max(1, Math.hypot(x, z));
        body.linearVelocity[0] = (forward.x * z - forward.z * x) * speed / length;
        body.linearVelocity[2] = (forward.z * z + forward.x * x) * speed / length;
        clock.current += Math.min(delta, 0.1);
        while (clock.current >= STEP) {
            kcc.refreshContacts(physics.world, body, physics.queryFilter);
            const grounded = kcc.isSupported(body);
            body.linearVelocity[1] = input.current.jump && grounded ? jumpSpeed
                : grounded && body.linearVelocity[1] <= 0 ? 0 : body.linearVelocity[1] + GRAVITY[1] * STEP;
            input.current.jump = false;
            kcc.update(physics.world, body, STEP, GRAVITY, updateSettings, undefined, physics.queryFilter);
            clock.current -= STEP;
        }
        position.fromArray(body.position);
        transform.parent?.worldToLocal(position);
        transform.position.copy(position);
    }, -0.5);

    return <PerspectiveCamera ref={camera} makeDefault position={[0, height / 2 - radius * 0.5, 0]} fov={75} near={0.05} far={500} />;
}

function View({ properties, children }: ComponentViewProps<Properties>) {
    const { editMode, preparing } = useNode();
    return <>
        {editMode || preparing ? <mesh>
            <capsuleGeometry args={[properties.radius, Math.max(0, properties.height - properties.radius * 2), 4, 12]} />
            <meshBasicMaterial color="#38bdf8" wireframe />
        </mesh> : <Controller {...properties} />}
        {children}
    </>;
}

export const SimplePlayerComponent: Component<Properties> = {
    name: 'SimplePlayer',
    description: 'One first-person player. Click the canvas in Play for mouse look; WASD moves, Space jumps, Escape releases the pointer. Node position is capsule center.',
    View,
    properties: {
        speed: { default: 6, min: 0, step: 0.5 },
        jumpSpeed: { default: 6, min: 0, step: 0.5 },
        pushForce: { default: 5000, min: 0, step: 100, description: 'Maximum force in newtons applied to dynamic bodies.' },
        radius: { default: 0.35, min: 0.05, step: 0.05 },
        height: { default: 1.8, min: 0.1, step: 0.1 },
        sensitivity: { default: 0.002, min: 0.0001, step: 0.0001 },
    },
};

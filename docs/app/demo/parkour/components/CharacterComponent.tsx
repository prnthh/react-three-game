import { Html, PerspectiveCamera, PointerLockControls } from '@react-three/drei';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CameraHelper, Group, MathUtils, Mesh, PerspectiveCamera as AimCamera, Quaternion, Vector3 } from 'three';
import { soundManager, useGameObject, useNode, useSceneComponents, type Component, type ComponentViewProps } from 'react-three-game/viewer';
import { withBasePath } from '../../../basePath';
import { COLLISION_SURFACE } from './CollisionSurfaceComponent';
import { cameraFov, cameraRoll, wallrunYaw } from '../camera';
import { CROUCH_HEIGHT, CROUCH_SPEED, DEFAULT_MOVEMENT_SETTINGS, STANDING_HEIGHT, isWallClimbing } from '../movement';
import { PLAYER_RADIUS } from '../collision';
import { advanceParkour, createParkourSimulation, parkourRenderPosition, type ParkourSimulation } from '../simulation';

import { attemptCollision, Buttons, createAttempt, packCommand, unpackCommand, Replay, type Attempt } from '../replay';

type Properties = { speed: number; jumpSpeed: number; slideBoost: number; color: string; debug: boolean };
const STEP_SOUND = '/sound/step.mp3';
const WIND_SOUND = '/sound/wind.mp3';
const FOOTSTEP_INTERVAL = 0.3;
const MOVEMENT_SOUND_MIN_SPEED = 0.5;

function crouchLean(speed: number) {
    const height = CROUCH_HEIGHT - 0.25 * MathUtils.smoothstep(speed, CROUCH_SPEED, DEFAULT_MOVEMENT_SETTINGS.speed);
    return Math.acos((height - 2 * PLAYER_RADIUS) / (STANDING_HEIGHT - 2 * PLAYER_RADIUS));
}

function Controller(settings: Properties) {
    const object = useGameObject();
    const surfaces = useSceneComponents(COLLISION_SURFACE);
    const { gl, scene } = useThree();
    // Controls own yaw/pitch. The rendered camera adds roll separately, so mouse look cannot erase it.
    const aim = useMemo(() => new AimCamera(), []);
    const camera = useRef<AimCamera>(null);
    const debugCamera = useRef<AimCamera>(null);
    const cameraHelper = useRef<CameraHelper | null>(null);
    const debugTarget = useRef(new Vector3());
    const body = useRef<Group>(null);
    const capsule = useRef<Mesh>(null);
    const bodyRotation = useRef(new Quaternion());
    const up = useMemo(() => new Vector3(0, 1, 0), []);
    const input = useRef({ keys: new Set<string>(), jump: false });
    const motion = useRef<ParkourSimulation | null>(null);
    const attempt = useRef<Attempt | null>(null);
    const replay = useRef<Replay | null>(null);
    const restart = useRef(false);
    const spawnRotation = useRef(new Quaternion());
    const ghost = useRef<Group>(null);
    const ghostCapsule = useRef<Mesh>(null);
    const statusLabel = useRef<HTMLDivElement>(null);
    const speedLabel = useRef<HTMLSpanElement>(null);
    const fpsLabel = useRef<HTMLDivElement>(null);
    const fpsSample = useRef({ frames: 0, elapsed: 0 });
    const hudClock = useRef(0);
    const footstepClock = useRef(0);
    const wasGrounded = useRef(false);
    const windPlayback = useRef<{ stop(): void } | null>(null);
    const spawn = useRef(new Vector3());
    const forward = useRef(new Vector3());
    const position = useRef(new Vector3());
    const parentRotation = useRef(new Quaternion());
    const view = useRef({ yaw: 0, roll: 0, crouch: 0, fov: 75 });
    const yawAssist = useRef(false);
    useEffect(() => {
        for (const clip of [STEP_SOUND, WIND_SOUND]) {
            void soundManager.load(clip, withBasePath(clip)).catch(() => { });
        }
        return () => {
            windPlayback.current?.stop();
            windPlayback.current = null;
        };
    }, []);
    useEffect(() => {
        if (!settings.debug || !camera.current) return;
        const helper = new CameraHelper(camera.current);
        // Keep the diagnostic frustum short enough to inspect beside the body.
        scene.add(helper);
        cameraHelper.current = helper;
        return () => { scene.remove(helper); helper.dispose(); cameraHelper.current = null; };
    }, [settings.debug, scene]);
    useEffect(() => {
        const clear = () => { yawAssist.current = false; input.current.keys.clear(); input.current.jump = false; if (motion.current) { motion.current.remainder = 0; motion.current.previous = motion.current.current; } };
        const keydown = (event: KeyboardEvent) => {
            if (document.pointerLockElement !== gl.domElement) return;
            if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ControlLeft', 'ControlRight', 'KeyC', 'KeyT'].includes(event.code)) event.preventDefault();
            void soundManager.resume();
            input.current.keys.add(event.code);
            if (event.code === 'Space' && !event.repeat) input.current.jump = true;
            if (event.code === 'KeyT' && !event.repeat) restart.current = true;
        };
        const wheel = (event: WheelEvent) => {
            if (document.pointerLockElement !== gl.domElement || !event.deltaY) return;
            event.preventDefault();
            input.current.jump = true;
        };
        const mouse = (event: MouseEvent) => {
            if (event.button !== 2) return;
            if (event.type === 'mouseup') input.current.keys.delete('MouseRight');
            else if (document.pointerLockElement === gl.domElement) input.current.keys.add('MouseRight');
        };
        const mousemove = (event: MouseEvent) => {
            if (document.pointerLockElement === gl.domElement && (event.movementX || event.movementY)) yawAssist.current = false;
        };
        const contextmenu = (event: MouseEvent) => {
            if (document.pointerLockElement === gl.domElement) event.preventDefault();
        };
        window.addEventListener('wheel', wheel, { passive: false });
        window.addEventListener('mousedown', mouse); window.addEventListener('mouseup', mouse);
        window.addEventListener('contextmenu', contextmenu);
        document.addEventListener('mousemove', mousemove);
        const keyup = (event: KeyboardEvent) => input.current.keys.delete(event.code);
        window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
        window.addEventListener('blur', clear); document.addEventListener('pointerlockchange', clear);
        return () => {
            window.removeEventListener('wheel', wheel);
            window.removeEventListener('mousedown', mouse); window.removeEventListener('mouseup', mouse);
            window.removeEventListener('contextmenu', contextmenu);
            document.removeEventListener('mousemove', mousemove);
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
        // Measure render frames using real elapsed time, independent of physics ticks.
        fpsSample.current.frames++;
        fpsSample.current.elapsed += frameDelta;
        if (fpsSample.current.elapsed >= 0.5) {
            if (fpsLabel.current) fpsLabel.current.textContent = `${Math.round(fpsSample.current.frames / fpsSample.current.elapsed)} FPS`;
            fpsSample.current.frames = 0;
            fpsSample.current.elapsed = 0;
        }
        const transform = object.transform;
        if (!transform || !camera.current) return;
        const delta = Math.min(frameDelta, 0.1);
        if (!motion.current) {
            transform.getWorldPosition(spawn.current);
            transform.getWorldQuaternion(aim.quaternion);
            spawnRotation.current.copy(aim.quaternion);
            motion.current = createParkourSimulation(spawn.current.toArray());
            aim.getWorldDirection(forward.current);
            view.current.yaw = Math.atan2(-forward.current.x, -forward.current.z);
        }
        if (restart.current) {
            replay.current = attempt.current?.recording.ticks ? new Replay(attempt.current) : null;
            motion.current = createParkourSimulation(spawn.current.toArray());
            attempt.current = null;
            aim.quaternion.copy(spawnRotation.current);
            yawAssist.current = false;
            input.current.jump = false;
            wasGrounded.current = false;
            footstepClock.current = 0;
            view.current.roll = 0;
            view.current.crouch = 0;
            restart.current = false;
            aim.getWorldDirection(forward.current);
            view.current.yaw = Math.atan2(-forward.current.x, -forward.current.z);
        }
        aim.getWorldDirection(forward.current); forward.current.y = 0; forward.current.normalize();
        const locked = document.pointerLockElement === gl.domElement;
        if (locked) {
            const state = motion.current.current;
            if (yawAssist.current) {
                const yaw = Math.atan2(-forward.current.x, -forward.current.z);
                const yawChange = wallrunYaw(yaw, state.wallNormal, state.velocity, delta) - yaw;
                if (Math.abs(yawChange) < 0.001 * delta) yawAssist.current = false;
                // Apply to control aim before recording input; replay consumes the assisted yaw.
                if (yawChange !== 0) {
                    aim.rotateOnWorldAxis(up, yawChange);
                    aim.getWorldDirection(forward.current); forward.current.y = 0; forward.current.normalize();
                }
            }
            const keys = input.current.keys;
            const buttons = (keys.has('KeyW') ? Buttons.forward : 0)
                | (keys.has('KeyS') ? Buttons.back : 0)
                | (keys.has('KeyA') ? Buttons.left : 0)
                | (keys.has('KeyD') ? Buttons.right : 0)
                | (input.current.jump ? Buttons.jump : 0)
                | (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC') ? Buttons.crouch : 0)
                | (keys.has('MouseRight') ? Buttons.detach : 0);
            const packed = packCommand(buttons, Math.atan2(-forward.current.x, -forward.current.z));
            if (!attempt.current) {
                const bounds = surfaces.flatMap(s => { const b = s.value.bounds(); return b ? [b] : []; });
                attempt.current = createAttempt(spawn.current.toArray(), settings, bounds);
            }
            const steps = advanceParkour(motion.current, frameDelta, unpackCommand(packed),
                attempt.current.settings, attemptCollision(attempt.current), command => {
                    // advanceParkour consumes a jump on only the first physics tick.
                    attempt.current!.recording.append(command.jump ? packed : packed & ~Buttons.jump);
                    if (replay.current && !replay.current.step()) replay.current = null;
                });
            if (steps) {
                input.current.jump = false;
                const next = motion.current.current;
                // Arm once on a new wall contact; mouse input cancels until the next entry.
                if (!next.wallNormal) yawAssist.current = false;
                else if (!state.wallNormal || next.wallNormal[0] !== state.wallNormal[0]
                    || next.wallNormal[1] !== state.wallNormal[1] || next.wallTime < state.wallTime) {
                    yawAssist.current = !isWallClimbing(next.wallNormal, forward.current.x, forward.current.z);
                }
            }
            if (motion.current.current.position[1] < -12) restart.current = true;
            position.current.fromArray(parkourRenderPosition(motion.current));
            transform.parent?.worldToLocal(position.current);
            transform.position.copy(position.current);
        }
        if (ghost.current && ghostCapsule.current) {
            const playback = replay.current;
            ghost.current.visible = !!playback && playback.tick < playback.attempt.recording.ticks;
            if (playback) {
                playback.simulation.remainder = motion.current.remainder;
                ghost.current.position.fromArray(parkourRenderPosition(playback.simulation));
                ghost.current.rotation.y = Math.atan2(-playback.command.facingX, -playback.command.facingZ);
                const crouched = playback.simulation.current.crouched;
                const length = STANDING_HEIGHT - 2 * PLAYER_RADIUS;
                const lean = crouched ? crouchLean(Math.hypot(...playback.simulation.current.velocity)) : 0;
                ghostCapsule.current.rotation.x = lean;
                ghostCapsule.current.position.y = (2 * PLAYER_RADIUS + length * Math.cos(lean)) / 2;
            }
        }
        const state = motion.current.current;
        const speed = Math.hypot(...state.velocity);
        const sliding = locked && state.grounded && state.crouched && speed > MOVEMENT_SOUND_MIN_SPEED;
        const wallrunning = !!state.wallNormal
            && !isWallClimbing(state.wallNormal, forward.current.x, forward.current.z);
        const walking = locked && (state.grounded || wallrunning) && !state.crouched && speed > MOVEMENT_SOUND_MIN_SPEED;
        const landed = locked && state.grounded && !wasGrounded.current;
        wasGrounded.current = state.grounded;
        if (sliding) {
            if (!windPlayback.current && soundManager.hasBuffer(WIND_SOUND)) {
                windPlayback.current = soundManager.playSync(WIND_SOUND, { loop: true, volume: 0.18, pitch: 0.95 }) ?? null;
            }
        } else if (windPlayback.current) {
            windPlayback.current.stop();
            windPlayback.current = null;
        }
        if (landed && soundManager.hasBuffer(STEP_SOUND)) {
            soundManager.playSync(STEP_SOUND, {
                volume: 0.2 + Math.random() * 0.04,
                pitch: 0.9 + Math.random() * 0.12,
            });
            footstepClock.current = MathUtils.clamp(FOOTSTEP_INTERVAL * settings.speed / Math.max(speed, settings.speed), 0.18, 0.38);
        } else if (walking) {
            footstepClock.current -= delta;
            if (footstepClock.current <= 0 && soundManager.hasBuffer(STEP_SOUND)) {
                soundManager.playSync(STEP_SOUND, {
                    volume: 0.16 + Math.random() * 0.04,
                    pitch: 0.92 + Math.random() * 0.16,
                });
                footstepClock.current = MathUtils.clamp(FOOTSTEP_INTERVAL * settings.speed / speed, 0.18, 0.38);
            }
        } else {
            footstepClock.current = 0;
        }
        hudClock.current += delta;
        if (hudClock.current >= 0.1) {
            hudClock.current = 0;
            const label = `${speed.toFixed(1)} horizontal · ${state.velocityY.toFixed(1)} vertical`;
            if (speedLabel.current && speedLabel.current.textContent !== label) speedLabel.current.textContent = label;
        }
        let nextStatus = state.velocityY > 0 ? 'Jumping' : 'Falling';
        if (state.wallNormal) {
            const mode = wallrunning ? 'Wallrun' : 'Wallclimb';
            nextStatus = `${mode} · Release W / Ctrl / RMB to drop · Space / wheel to jump`;
        }
        if (state.grounded) {
            nextStatus = state.crouched
                ? speed > 0.1 ? 'Sliding · Space to launch' : 'Crouched · Release to run'
                : speed > 0.1 ? 'Running · Ctrl / C to slide' : 'Grounded · Ctrl / C to slide';
        }
        if (statusLabel.current && statusLabel.current.textContent !== nextStatus) statusLabel.current.textContent = nextStatus;
        const yaw = Math.atan2(-forward.current.x, -forward.current.z);
        const turn = Math.atan2(Math.sin(yaw - view.current.yaw), Math.cos(yaw - view.current.yaw));
        const targetRoll = locked ? cameraRoll(turn / Math.max(delta, 0.001), state.wallNormal, forward.current.x, forward.current.z) : 0;
        view.current.yaw = yaw;
        view.current.roll = MathUtils.damp(view.current.roll, targetRoll, 9, delta);
        view.current.crouch = MathUtils.damp(view.current.crouch, state.crouched ? 1 : 0, 14, delta);
        const length = STANDING_HEIGHT - 2 * PLAYER_RADIUS;
        // Crouch walking stays taller; faster slides recline below eye level.
        const lean = view.current.crouch * crouchLean(speed);
        const height = 2 * PLAYER_RADIUS + length * Math.cos(lean);
        view.current.fov = MathUtils.damp(view.current.fov, cameraFov(speed), 5, delta);
        transform.getWorldQuaternion(parentRotation.current);
        camera.current.quaternion.copy(parentRotation.current.invert()).multiply(aim.quaternion);
        camera.current.rotateZ(view.current.roll);
        // Follow the upper end backward without pitching the view with the body.
        const eyeHeight = MathUtils.lerp(STANDING_HEIGHT - 0.2, CROUCH_HEIGHT - 0.2, view.current.crouch);
        camera.current.position.set(-forward.current.x * length / 2 * Math.sin(lean), eyeHeight,
            -forward.current.z * length / 2 * Math.sin(lean)).applyQuaternion(parentRotation.current);
        if (body.current && capsule.current) {
            bodyRotation.current.setFromAxisAngle(up, yaw);
            body.current.quaternion.copy(parentRotation.current).multiply(bodyRotation.current);
            capsule.current.position.y = height / 2;
            capsule.current.rotation.x = lean;
        }
        if (camera.current.fov !== view.current.fov) {
            camera.current.fov = view.current.fov;
            camera.current.updateProjectionMatrix();
        }
        if (settings.debug && debugCamera.current) {
            debugCamera.current.position.set(-forward.current.x * 4, 2.6, -forward.current.z * 4)
                .applyQuaternion(parentRotation.current);
            transform.updateWorldMatrix(true, true);
            debugTarget.current.set(0, height / 2, 0).applyMatrix4(transform.matrixWorld);
            debugCamera.current.lookAt(debugTarget.current);
            cameraHelper.current?.update();
        }
    });
    const hud = <Html position={[0, 0, -1]} fullscreen zIndexRange={[10, 10]} style={{ pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', bottom: 24, left: 64, color: 'white', fontFamily: 'Arial, Helvetica, sans-serif', fontVariantNumeric: 'tabular-nums', textShadow: '0 1px 3px #0008' }}>
            <div style={{ fontSize: 28, fontWeight: 600, fontStyle: 'italic', lineHeight: 1.2 }}><span ref={speedLabel}>0.0</span> <span style={{ fontSize: 16 }}>m/s</span></div>
            <div ref={statusLabel} style={{ marginTop: 4, fontSize: 13 }}>Airborne</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>T · Restart & replay last attempt</div>
            <div ref={fpsLabel} style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>— FPS</div>
        </div>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'white', opacity: 0.7 }}>·</div>
    </Html>;
    return <>
        {createPortal(<group ref={ghost} visible={false}>
            <mesh ref={ghostCapsule} raycast={() => {}}>
                <capsuleGeometry args={[PLAYER_RADIUS, STANDING_HEIGHT - 2 * PLAYER_RADIUS, 8, 16]} />
                <meshStandardMaterial color="#67e8f9" emissive="#22d3ee" emissiveIntensity={0.35} transparent opacity={0.3} depthWrite={false} />
            </mesh>
        </group>, scene)}
        <group ref={body}>
            <mesh ref={capsule} position={[0, STANDING_HEIGHT / 2, 0]}>
                <capsuleGeometry args={[PLAYER_RADIUS, STANDING_HEIGHT - 2 * PLAYER_RADIUS, 8, 16]} />
                <meshStandardMaterial color={settings.color} />
            </mesh>
        </group>
        <PerspectiveCamera ref={camera} makeDefault={!settings.debug} position={[0, 1.6, 0]} fov={75} far={settings.debug ? 1.5 : 2000}>
            {/* Keep the screen overlay in front of the camera, not at the player's feet. */}
            {!settings.debug && hud}
        </PerspectiveCamera>
        {settings.debug && <PerspectiveCamera ref={debugCamera} makeDefault fov={60} position={[0, 2.6, 4]}>{hud}</PerspectiveCamera>}
        <PointerLockControls camera={aim} domElement={gl.domElement} selector="#parkour-canvas canvas" />
    </>;
}
function CharacterView({ properties, children }: ComponentViewProps<Properties>) {
    const { editMode } = useNode();
    return <>
        {!editMode ? <Controller {...properties} /> :
            <mesh position={[0, 0.9, 0]}><capsuleGeometry args={[0.3, 1.2, 4, 8]} /><meshStandardMaterial color={properties.color} /></mesh>}
        {children}
    </>;
}
export const CharacterComponent: Component<Properties> = {
    name: 'ParkourCharacter', description: 'Parkour player controller. Runs in Play; movement stays in demo state.',
    properties: {
        speed: { default: DEFAULT_MOVEMENT_SETTINGS.speed, min: 1, max: 27, step: 0.5, description: 'Acceleration target in world units per second; carried momentum may exceed it.' },
        jumpSpeed: { default: DEFAULT_MOVEMENT_SETTINGS.jumpSpeed, min: 1, max: 15, step: 0.5, description: 'Upward impulse for ground jumps; default rises approximately 1.4 world units. Wall jumps add a smaller impulse.' },
        slideBoost: { default: DEFAULT_MOVEMENT_SETTINGS.slideBoost, min: 0, max: 8, step: 0.25, description: 'One-time speed added when crouching above crouch speed. Sliding slows toward crouch speed with movement held, or stops with no input.' },
        color: { type: 'color', default: '#38bdf8' },
        debug: { type: 'boolean', default: false, description: 'In Play, follow behind the capsule and show the first-person camera frustum.' },
    }, View: CharacterView,
};

import { PerspectiveCamera, PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { CameraHelper, MathUtils, PerspectiveCamera as AimCamera, Quaternion, Vector3 } from 'three';
import { soundManager, useGameObject, useNode, type ComponentViewProps } from 'react-three-game/viewer';
import { withBasePath } from '../../../basePath';
import { useCollisionWorld } from './CollisionSurfaceComponent';
import { CharacterVisualsContext, createVisualRig, resetVisualGait, stepVisualGait, useCharacterVisuals } from './CharacterVisuals';
import { useParkourHUD } from '../hud';
import { cameraFov, cameraRoll, wallrunYaw } from '../camera';
import { CROUCH_HEIGHT, CROUCH_SPEED, DEFAULT_MOVEMENT_SETTINGS, STANDING_HEIGHT, isWallClimbing } from '../movement';
import { PLAYER_RADIUS } from '../collision';
import { advanceParkour, createParkourSimulation, parkourRenderPosition, PARKOUR_STEP, type ParkourSimulation } from '../simulation';

import { Buttons, createAttempt, packCommand, unpackCommand, Replay, type Attempt } from '../replay';

export type CharacterProperties = { speed: number; jumpSpeed: number; slideBoost: number; color: string; cameraBob: boolean; debug: boolean };
const STEP_SOUND = '/sound/step.mp3';
const WIND_SOUND = '/sound/wind.mp3';
const FOOTSTEP_INTERVAL = 0.3;
const MOVEMENT_SOUND_MIN_SPEED = 0.5;

function crouchLean(speed: number) {
    const height = CROUCH_HEIGHT - 0.25 * MathUtils.smoothstep(speed, CROUCH_SPEED, DEFAULT_MOVEMENT_SETTINGS.speed);
    return Math.acos((height - 2 * PLAYER_RADIUS) / (STANDING_HEIGHT - 2 * PLAYER_RADIUS));
}

function Controller(settings: CharacterProperties) {
    const object = useGameObject();
    const world = useCollisionWorld();
    const { gl, scene } = useThree();
    // Controls own yaw/pitch. The rendered camera adds roll separately, so mouse look cannot erase it.
    const aim = useMemo(() => new AimCamera(), []);
    const camera = useRef<AimCamera>(null);
    const debugCamera = useRef<AimCamera>(null);
    const cameraHelper = useRef<CameraHelper | null>(null);
    const debugTarget = useRef(new Vector3());
    const visuals = useCharacterVisuals();
    const { root: body, pose } = visuals.player;
    const bodyRotation = useRef(new Quaternion());
    const up = useMemo(() => new Vector3(0, 1, 0), []);
    const input = useRef({ keys: new Set<string>(), jump: false });
    const motion = useRef<ParkourSimulation | null>(null);
    const attempt = useRef<Attempt | null>(null);
    const replay = useRef<Replay | null>(null);
    const restart = useRef(false);
    useLayoutEffect(() => {
        // A changed scene starts fresh; recordings only apply to their original world.
        attempt.current = null;
        replay.current = null;
        restart.current = true;
    }, [world]);
    const spawnRotation = useRef(new Quaternion());
    const { root: ghost, pose: ghostPose } = visuals.replay;
    const hud = useParkourHUD();
    const display = useRef<ReturnType<NonNullable<typeof hud>['connect']> | null>(null);
    const fps = useRef(0);
    useEffect(() => {
        const connection = hud?.connect() ?? null;
        display.current = connection;
        return () => { connection?.dispose(); display.current = null; };
    }, [hud]);
    const fpsSample = useRef({ frames: 0, elapsed: 0 });
    const hudClock = useRef(0);
    const footstepClock = useRef(0);
    const wasGrounded = useRef(false);
    const windPlayback = useRef<{ stop(): void } | null>(null);
    const spawn = useRef(new Vector3());
    const forward = useRef(new Vector3());
    const position = useRef(new Vector3());
    const parentRotation = useRef(new Quaternion());
    const view = useRef({ yaw: 0, roll: 0, crouch: 0, fov: 75, bobPhase: 0, bob: 0 });
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
            attempt.current = null; replay.current = null;
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
            fps.current = Math.round(fpsSample.current.frames / fpsSample.current.elapsed);
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
            resetVisualGait(visuals.player);
            resetVisualGait(visuals.replay);
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
            view.current.bobPhase = 0;
            view.current.bob = 0;
            restart.current = false;
            aim.getWorldDirection(forward.current);
            view.current.yaw = Math.atan2(-forward.current.x, -forward.current.z);
        }
        aim.getWorldDirection(forward.current); forward.current.y = 0; forward.current.normalize();
        const locked = document.pointerLockElement === gl.domElement && world !== null;
        if (locked && world) {
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
                | (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC') || keys.has('MouseRight') ? Buttons.crouch : 0);
            const packed = packCommand(buttons, Math.atan2(-forward.current.x, -forward.current.z));
            if (!attempt.current) {
                attempt.current = createAttempt(spawn.current.toArray(), settings, world);
            }
            const steps = advanceParkour(motion.current, frameDelta, unpackCommand(packed),
                attempt.current.settings, attempt.current.collision, command => {
                    // advanceParkour consumes a jump on only the first physics tick.
                    attempt.current!.recording.append(command.jump ? packed : packed & ~Buttons.jump);
                    stepVisualGait(visuals.player, motion.current!.current, PARKOUR_STEP);
                    if (replay.current) {
                        if (replay.current.step()) stepVisualGait(visuals.replay, replay.current.simulation.current, PARKOUR_STEP);
                        else replay.current = null;
                    }
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
            if (motion.current.current.position[1] < -30) restart.current = true;
            position.current.fromArray(parkourRenderPosition(motion.current));
            transform.parent?.worldToLocal(position.current);
            transform.position.copy(position.current);
        }
        if (ghost.current && ghostPose.current) {
            const playback = replay.current;
            ghost.current.visible = !!playback && playback.tick < playback.attempt.recording.ticks;
            if (playback) {
                playback.simulation.remainder = motion.current.remainder;
                ghost.current.position.fromArray(parkourRenderPosition(playback.simulation));
                ghost.current.rotation.y = Math.atan2(-playback.command.facingX, -playback.command.facingZ);
                const crouched = playback.simulation.current.crouched;
                const length = STANDING_HEIGHT - 2 * PLAYER_RADIUS;
                const lean = crouched ? crouchLean(Math.hypot(...playback.simulation.current.velocity)) : 0;
                ghostPose.current.rotation.x = lean;
                ghostPose.current.position.y = (2 * PLAYER_RADIUS + length * Math.cos(lean)) / 2;
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
        let nextStatus = state.velocityY > 0 ? 'Jumping' : 'Falling';
        if (state.wallNormal) {
            const mode = wallrunning ? 'Wallrun' : 'Wallclimb';
            nextStatus = `${mode} · Release W / Ctrl / C / RMB to drop${state.wallJumpAvailable ? ' · Space / wheel to jump' : ' · Jump spent'}`;
        }
        if (state.grounded) {
            nextStatus = state.crouched
                ? speed > CROUCH_SPEED + 0.1 ? 'Sliding · Space to launch' : speed > 0.1 ? 'Crawling · Release to run' : 'Crouched · Release to run'
                : speed > 0.1 ? 'Running · Ctrl / C / RMB to slide' : 'Grounded · Ctrl / C / RMB to crouch';
        }
        if (!world) nextStatus = 'Loading course…';
        hudClock.current += frameDelta;
        if (hudClock.current >= 0.1) {
            hudClock.current = 0;
            display.current?.publish({ speed, verticalSpeed: state.velocityY, status: nextStatus, fps: fps.current });
        }
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
        const bobbing = settings.cameraBob && locked && state.grounded && !state.crouched && speed > MOVEMENT_SOUND_MIN_SPEED;
        if (bobbing) {
            const cadence = MathUtils.clamp(speed / settings.speed, 0.5, 1.4) / FOOTSTEP_INTERVAL;
            view.current.bobPhase = (view.current.bobPhase + delta * cadence * Math.PI * 2) % (Math.PI * 2);
        }
        const bobTarget = bobbing ? Math.sin(view.current.bobPhase) * 0.04
            * MathUtils.smoothstep(speed, MOVEMENT_SOUND_MIN_SPEED, settings.speed) : 0;
        // Only the eye moves; crouching, sliding and airborne motion settle to neutral.
        view.current.bob = settings.cameraBob ? MathUtils.damp(view.current.bob, bobTarget, 24, delta) : 0;
        const eyeHeight = MathUtils.lerp(STANDING_HEIGHT - 0.2, CROUCH_HEIGHT - 0.2, view.current.crouch);
        camera.current.position.set(-forward.current.x * length / 2 * Math.sin(lean), eyeHeight + view.current.bob,
            -forward.current.z * length / 2 * Math.sin(lean)).applyQuaternion(parentRotation.current);
        if (body.current && pose.current) {
            bodyRotation.current.setFromAxisAngle(up, yaw);
            body.current.quaternion.copy(parentRotation.current).multiply(bodyRotation.current);
            pose.current.position.y = height / 2;
            pose.current.rotation.x = lean;
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
    return <>
        <PerspectiveCamera ref={camera} makeDefault={!settings.debug} position={[0, 1.6, 0]} fov={75} far={settings.debug ? 1.5 : 2000} />
        {settings.debug && <PerspectiveCamera ref={debugCamera} makeDefault fov={60} position={[0, 2.6, 4]} />}
        <PointerLockControls camera={aim} domElement={gl.domElement} selector="#parkour-canvas canvas" />
    </>;
}
export default function CharacterView({ properties, children, enabled }: ComponentViewProps<CharacterProperties>) {
    const { editMode } = useNode();
    const player = useMemo(createVisualRig, []);
    const replay = useMemo(createVisualRig, []);
    const visuals = useMemo(() => ({ player, replay, color: properties.color }), [player, replay, properties.color]);
    return <CharacterVisualsContext.Provider value={visuals}>
        {enabled && !editMode && <Controller {...properties} />}
        {children}
    </CharacterVisualsContext.Provider>;
}

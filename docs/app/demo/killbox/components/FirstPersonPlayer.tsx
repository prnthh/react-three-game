"use client";

import { PerspectiveCamera, PointerLockControls, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { capsule, filter, kcc, rigidBody, MotionQuality, MotionType, type Filter, type RigidBody, type World } from "crashcat";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { gameEvents, PrefabEditorMode, useScene } from "react-three-game";
import { useCrashcat } from "react-three-game/plugins/crashcat";
import { MathUtils, Quaternion, Raycaster, Vector2, Vector3 } from "three";
import type { Camera, Group, Object3D } from "three";

const FOOTSTEP_CLIPS = ["/sound/hit.mp3", "/sound/hit2.mp3"] as const;
const DEFAULT_GRAB_DISTANCE = 2.75;
const DEFAULT_GRAB_RANGE = 8;
const DEFAULT_GRAB_STRENGTH = 18;
const DEFAULT_GRAB_MAX_SPEED = 14;
const DEFAULT_LAUNCH_SPEED = 18;
const CAMERA_SWAY_AMOUNT = 0.045;
const CAMERA_SWAY_LERP = 10;
const GRAVITY: [number, number, number] = [0, -9.81, 0];
const PLAYER_ID = "player";
const HAND_MODEL_URL = "/models/environment/picocad/hand1.glb";

const forwardVector = new Vector3();
const rightVector = new Vector3();
const wishVector = new Vector3();
const planarVelocityVector = new Vector3();
const worldUp = new Vector3(0, 1, 0);
const groupPosition = new Vector3();
const identityQuaternion = new Quaternion();
const centerScreen = new Vector2(0, 0);
const raycaster = new Raycaster();
const grabTargetPosition = new Vector3();
const grabBodyPosition = new Vector3();
const grabVelocity = new Vector3();
const grabQuaternion = new Quaternion();
const cameraWorldQuaternion = new Quaternion();
const playerBodyPosition: [number, number, number] = [0, 0, 0];
const playerBodyQuaternion: [number, number, number, number] = [0, 0, 0, 1];
const playerBodyVelocity: [number, number, number] = [0, 0, 0];

const forwardKeys = new Set(["KeyW", "ArrowUp"]);
const backwardKeys = new Set(["KeyS", "ArrowDown"]);
const leftKeys = new Set(["KeyA", "ArrowLeft"]);
const rightKeys = new Set(["KeyD", "ArrowRight"]);

export type FirstPersonPlayerProps = {
    radius?: number;
    halfHeightOfCylinder?: number;
    maxSpeed?: number;
    groundAccel?: number;
    airAccel?: number;
    friction?: number;
    jumpSpeed?: number;
    footstepEventName?: string;
    footstepInterval?: number;
    footstepRandomDelay?: number;
    footstepMinSpeed?: number;
    cameraHeight?: number;
    spawnPosition?: [number, number, number];
    children?: React.ReactNode;
};

export interface FirstPersonPlayerRef {
    getBody: () => RigidBody | null;
}

function moveToward(current: number, target: number, maxDelta: number) {
    if (current < target) return Math.min(current + maxDelta, target);
    if (current > target) return Math.max(current - maxDelta, target);
    return current;
}

function getPrefabNodeId(object: Object3D | null | undefined) {
    let current: Object3D | null | undefined = object;

    while (current) {
        if (typeof current.userData?.prefabNodeId === "string") {
            return current.userData.prefabNodeId;
        }

        current = current.parent;
    }

    return null;
}

function pressed(keys: Set<string>, group: Set<string>) {
    for (const k of group) if (keys.has(k)) return true;
    return false;
}

const FirstPersonPlayer = forwardRef<FirstPersonPlayerRef, FirstPersonPlayerProps>(function FirstPersonPlayer({
    radius = 0.35,
    halfHeightOfCylinder = 0.45,
    maxSpeed = 7,
    groundAccel = 18,
    airAccel = 6,
    friction = 10,
    jumpSpeed = 6.5,
    footstepEventName = "player:footstep",
    footstepInterval = 0.3,
    footstepRandomDelay = 0.15,
    footstepMinSpeed = 1.5,
    cameraHeight = 0.54,
    spawnPosition = [0, 1.3, 6],
    children,
}, ref) {
    const scene = useScene();
    const mode = scene.mode;
    const runtime = useCrashcat();
    const playerGroupRef = useRef<Group>(null);
    const cameraSwayRef = useRef<Group>(null);
    const planarVelocityRef = useRef(new Vector3());
    const footstepTimerRef = useRef(0);
    const characterRef = useRef<ReturnType<typeof kcc.create> | null>(null);
    const updateSettingsRef = useRef(kcc.createDefaultUpdateSettings());
    const pressedKeysRef = useRef(new Set<string>());
    const jumpQueuedRef = useRef(false);
    const characterFilterRef = useRef<Filter | null>(null);
    const playerBodyRef = useRef<RigidBody | null>(null);
    const footstepAudioRefs = useRef<HTMLAudioElement[]>([]);
    const nextFootstepAudioRef = useRef(0);

    useImperativeHandle(ref, () => ({
        getBody: () => playerBodyRef.current,
    }), []);

    const resetPlayerState = useCallback(() => {
        characterRef.current = null;
        characterFilterRef.current = null;
        planarVelocityRef.current.set(0, 0, 0);
        footstepTimerRef.current = 0;
        jumpQueuedRef.current = false;
        pressedKeysRef.current.clear();
    }, []);

    useEffect(() => {
        if (mode === PrefabEditorMode.Play) {
            return;
        }

        resetPlayerState();
    }, [mode, resetPlayerState]);

    useEffect(() => {
        if (mode !== PrefabEditorMode.Play) return;

        const setKey = (down: boolean) => (event: KeyboardEvent) => {
            if (event.code === "Space") {
                if (down && !event.repeat) jumpQueuedRef.current = true;
                return;
            }
            if (!forwardKeys.has(event.code) && !backwardKeys.has(event.code)
                && !leftKeys.has(event.code) && !rightKeys.has(event.code)) return;
            if (down) pressedKeysRef.current.add(event.code);
            else pressedKeysRef.current.delete(event.code);
        };
        const handleKeyDown = setKey(true);
        const handleKeyUp = setKey(false);
        const clearInput = () => {
            pressedKeysRef.current.clear();
            jumpQueuedRef.current = false;
        };
        const handleContextMenu = (event: MouseEvent) => {
            event.preventDefault();
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", clearInput);
        window.addEventListener("contextmenu", handleContextMenu);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", clearInput);
            window.removeEventListener("contextmenu", handleContextMenu);
        };
    }, [mode]);

    useEffect(() => {
        footstepAudioRefs.current = FOOTSTEP_CLIPS.map((clip) => {
            const audio = new Audio(clip);
            audio.preload = "auto";
            return audio;
        });

        return () => {
            footstepAudioRefs.current.forEach((audio) => {
                audio.pause();
                audio.removeAttribute("src");
                audio.load();
            });
            footstepAudioRefs.current = [];
        };
    }, []);

    const playFootstepSound = () => {
        const clips = footstepAudioRefs.current;
        if (clips.length === 0) {
            return;
        }

        const audio = clips[nextFootstepAudioRef.current % clips.length];
        nextFootstepAudioRef.current += 1;
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 0.1 + Math.random() * 0.05;
        audio.playbackRate = 0.9 + Math.random() * 0.14;
        void audio.play().catch(() => { });
    };

    useEffect(() => {
        if (mode !== PrefabEditorMode.Play) {
            return;
        }

        const world = runtime?.world;
        if (!world || playerBodyRef.current) {
            return;
        }

        playerBodyRef.current = rigidBody.create(world, {
            shape: capsule.create({
                radius,
                halfHeightOfCylinder,
            }),
            motionType: MotionType.KINEMATIC,
            objectLayer: runtime.movingObjectLayer,
            position: spawnPosition,
            quaternion: [0, 0, 0, 1],
            collideKinematicVsNonDynamic: true,
            friction: 0,
            userData: { nodeId: PLAYER_ID },
        });

        return () => {
            if (!playerBodyRef.current) {
                return;
            }

            rigidBody.remove(world, playerBodyRef.current);
            playerBodyRef.current = null;
        };
    }, [halfHeightOfCylinder, mode, radius, runtime, spawnPosition]);

    useFrame((state, delta) => {
        if (mode !== PrefabEditorMode.Play) {
            return;
        }

        const keys = pressedKeysRef.current;
        const forwardInput = Number(pressed(keys, forwardKeys)) - Number(pressed(keys, backwardKeys));
        const rightInput = Number(pressed(keys, rightKeys)) - Number(pressed(keys, leftKeys));

        const cameraSway = cameraSwayRef.current;
        if (cameraSway) {
            const targetSway = -rightInput * CAMERA_SWAY_AMOUNT;
            cameraSway.rotation.z = MathUtils.lerp(cameraSway.rotation.z, targetSway, Math.min(1, CAMERA_SWAY_LERP * delta));
        }

        state.camera.updateMatrixWorld();

        const world = runtime?.world;
        const baseQueryFilter = runtime?.queryFilter;
        const playerGroup = playerGroupRef.current;
        if (!world || !baseQueryFilter || !playerGroup) {
            return;
        }

        if (!characterRef.current) {
            resetPlayerState();
            characterRef.current = kcc.create({
                shape: capsule.create({
                    radius,
                    halfHeightOfCylinder,
                }),
                maxSlopeAngle: Math.PI / 3,
                characterPadding: 0.02,
            }, spawnPosition, [0, 0, 0, 1]);
        }

        if (!characterFilterRef.current) {
            characterFilterRef.current = filter.forWorld(world);
        }

        const character = characterRef.current;
        const characterFilter = characterFilterRef.current;
        filter.copy(characterFilter, baseQueryFilter);
        characterFilter.bodyFilter = playerBodyRef.current ? (body) => body !== playerBodyRef.current : undefined;

        state.camera.getWorldDirection(forwardVector);
        forwardVector.y = 0;

        if (forwardVector.lengthSq() < 1e-6) {
            forwardVector.set(0, 0, -1);
        } else {
            forwardVector.normalize();
        }

        rightVector.crossVectors(forwardVector, worldUp).normalize();

        wishVector
            .copy(forwardVector)
            .multiplyScalar(forwardInput)
            .addScaledVector(rightVector, rightInput);

        const stepDelta = Math.min(delta, 1 / 30);
        kcc.refreshContacts(world, character, characterFilter);
        const grounded = kcc.isSupported(character);
        const planarVelocity = planarVelocityRef.current;
        const currentVelocityY = character.linearVelocity[1];

        const desiredPlanarSpeed = wishVector.lengthSq() > 0
            ? wishVector.normalize().multiplyScalar(maxSpeed)
            : wishVector.set(0, 0, 0);

        const accel = grounded ? groundAccel : airAccel;
        const maxDelta = accel * delta;
        planarVelocity.set(
            moveToward(planarVelocity.x, desiredPlanarSpeed.x, maxDelta),
            0,
            moveToward(planarVelocity.z, desiredPlanarSpeed.z, maxDelta),
        );

        if (grounded && planarVelocity.lengthSq() > 0 && desiredPlanarSpeed.lengthSq() === 0) {
            const damping = Math.max(0, 1 - friction * delta * 0.1);
            planarVelocity.multiplyScalar(damping);
        }

        if (grounded && jumpQueuedRef.current) {
            character.linearVelocity[1] = jumpSpeed;
            jumpQueuedRef.current = false;
        } else {
            character.linearVelocity[1] = grounded
                ? (currentVelocityY < 0 ? 0 : currentVelocityY)
                : currentVelocityY + GRAVITY[1] * stepDelta;
        }

        character.linearVelocity[0] = planarVelocity.x;
        character.linearVelocity[2] = planarVelocity.z;

        kcc.update(world, character, stepDelta, GRAVITY, updateSettingsRef.current, undefined, characterFilter);

        const speed = planarVelocity.length();
        const moving = grounded && desiredPlanarSpeed.lengthSq() > 0 && speed > footstepMinSpeed;

        if (!moving) {
            if (footstepTimerRef.current !== 0) {
                footstepTimerRef.current = 0;
            }
        } else {
            footstepTimerRef.current -= delta;

            if (footstepTimerRef.current <= 0) {
                gameEvents.emit(footstepEventName, {
                    sourceEntityId: PLAYER_ID,
                    sourceNodeId: PLAYER_ID,
                    speed,
                });
                playFootstepSound();

                footstepTimerRef.current = footstepInterval + Math.random() * footstepRandomDelay;
            }
        }

        groupPosition.set(character.position[0], character.position[1], character.position[2]);
        playerGroup.position.copy(groupPosition);
        playerGroup.quaternion.copy(identityQuaternion);
        playerGroup.updateMatrixWorld(true);

        if (playerBodyRef.current) {
            playerBodyPosition[0] = groupPosition.x;
            playerBodyPosition[1] = groupPosition.y;
            playerBodyPosition[2] = groupPosition.z;
            rigidBody.setPosition(world, playerBodyRef.current, playerBodyPosition, true);
            rigidBody.setQuaternion(world, playerBodyRef.current, playerBodyQuaternion, true);
            playerBodyVelocity[0] = character.linearVelocity[0];
            playerBodyVelocity[1] = character.linearVelocity[1];
            playerBodyVelocity[2] = character.linearVelocity[2];
            rigidBody.setLinearVelocity(world, playerBodyRef.current, playerBodyVelocity);
        }

    }, -2);

    if (mode !== PrefabEditorMode.Play) {
        return null;
    }

    return (
        <group ref={playerGroupRef} position={spawnPosition}>
            <group position={[0, cameraHeight, 0]}>
                <group ref={cameraSwayRef}>
                    <PerspectiveCamera makeDefault fov={90} near={0.1} far={1000} />
                    <PointerLockControls makeDefault />
                </group>

                <GrabArms />
                {children}
            </group>
        </group>
    );
});


export default FirstPersonPlayer;

const GrabArms = () => {
    // const { scene: handScene } = useGLTF(HAND_MODEL_URL);
    // const handModel = useMemo(() => handScene.clone(), [handScene]);
    const scene = useThree((state) => state.scene);
    const sceneApi = useScene();
    const mode = sceneApi.mode;
    const runtime = useCrashcat();

    const grabbedNodeIdRef = useRef<string | null>(null);
    const grabbedMotionQualityRef = useRef<MotionQuality | null>(null);
    const grabbedRotationOffsetRef = useRef(new Quaternion());
    const lastFirePressedRef = useRef(false);
    const lastAimPressedRef = useRef(false);
    const firePressedRef = useRef(false);
    const aimPressedRef = useRef(false);

    const resetGrabState = useCallback(() => {
        grabbedNodeIdRef.current = null;
        grabbedMotionQualityRef.current = null;
        grabbedRotationOffsetRef.current.identity();
        lastFirePressedRef.current = false;
        lastAimPressedRef.current = false;
        firePressedRef.current = false;
        aimPressedRef.current = false;
    }, []);

    const restoreGrabbedMotionQuality = useCallback(() => {
        const grabbedNodeId = grabbedNodeIdRef.current;
        const originalMotionQuality = grabbedMotionQualityRef.current;

        if (!grabbedNodeId || originalMotionQuality === null) {
            grabbedMotionQualityRef.current = null;
            return;
        }

        const body = runtime?.getBody(grabbedNodeId) ?? null;
        if (body) {
            body.motionProperties.motionQuality = originalMotionQuality;
        }

        grabbedMotionQualityRef.current = null;
    }, [runtime]);

    useEffect(() => {
        if (mode === PrefabEditorMode.Play) {
            return;
        }

        restoreGrabbedMotionQuality();
        resetGrabState();
    }, [mode, resetGrabState, restoreGrabbedMotionQuality]);

    useEffect(() => {
        if (mode !== PrefabEditorMode.Play) return;

        const handleMouseDown = (event: MouseEvent) => {
            if (event.button === 0) firePressedRef.current = true;
            if (event.button === 2) aimPressedRef.current = true;
        };
        const handleMouseUp = (event: MouseEvent) => {
            if (event.button === 0) firePressedRef.current = false;
            if (event.button === 2) aimPressedRef.current = false;
        };
        const clearInput = () => {
            firePressedRef.current = false;
            aimPressedRef.current = false;
        };

        window.addEventListener("mousedown", handleMouseDown);
        window.addEventListener("mouseup", handleMouseUp);
        window.addEventListener("blur", clearInput);

        return () => {
            window.removeEventListener("mousedown", handleMouseDown);
            window.removeEventListener("mouseup", handleMouseUp);
            window.removeEventListener("blur", clearInput);
        };
    }, [mode]);

    const releaseGrabbed = useCallback((world: World, camera: Camera, launch = false) => {
        const grabbedNodeId = grabbedNodeIdRef.current;
        if (!grabbedNodeId) {
            return;
        }

        const body = runtime?.getBody(grabbedNodeId) ?? null;
        if (body && launch) {
            camera.getWorldDirection(forwardVector);
            forwardVector.normalize();
            grabVelocity.copy(forwardVector).multiplyScalar(DEFAULT_LAUNCH_SPEED);
            grabVelocity.add(planarVelocityVector);
            rigidBody.setAngularVelocity(world, body, [0, 0, 0]);
            rigidBody.setLinearVelocity(world, body, [grabVelocity.x, grabVelocity.y, grabVelocity.z]);
        }

        restoreGrabbedMotionQuality();
        grabbedNodeIdRef.current = null;
    }, [restoreGrabbedMotionQuality, runtime]);

    const tryGrabTarget = useCallback((world: World, camera: Camera) => {
        raycaster.setFromCamera(centerScreen, camera);

        const intersections = raycaster.intersectObjects(scene.children, true);
        for (const intersection of intersections) {
            const nodeId = getPrefabNodeId(intersection.object);
            if (!nodeId) {
                continue;
            }

            const body = runtime?.getBody(nodeId) ?? null;
            if (!body || body.motionType !== MotionType.DYNAMIC || nodeId === PLAYER_ID) {
                continue;
            }

            if (intersection.distance > DEFAULT_GRAB_RANGE) {
                return;
            }

            grabbedNodeIdRef.current = nodeId;
            grabbedMotionQualityRef.current = body.motionProperties.motionQuality;
            body.motionProperties.motionQuality = MotionQuality.LINEAR_CAST;
            grabQuaternion.set(body.quaternion[0], body.quaternion[1], body.quaternion[2], body.quaternion[3]);
            camera.getWorldQuaternion(cameraWorldQuaternion);
            grabbedRotationOffsetRef.current.copy(cameraWorldQuaternion).invert().multiply(grabQuaternion);
            rigidBody.setAngularVelocity(world, body, [0, 0, 0]);
            return;
        }
    }, [runtime, scene]);

    useFrame((state) => {
        if (mode !== PrefabEditorMode.Play) {
            return;
        }

        const world = runtime?.world;
        if (!world) {
            return;
        }

        const firePressed = firePressedRef.current;
        const aimPressed = aimPressedRef.current;
        const aimPressedThisFrame = aimPressed && !lastAimPressedRef.current;
        const firePressedThisFrame = firePressed && !lastFirePressedRef.current;

        if (aimPressedThisFrame) {
            if (grabbedNodeIdRef.current) {
                releaseGrabbed(world, state.camera, false);
            } else {
                tryGrabTarget(world, state.camera);
            }
        }

        if (firePressedThisFrame && grabbedNodeIdRef.current) {
            releaseGrabbed(world, state.camera, true);
        }

        lastAimPressedRef.current = aimPressed;
        lastFirePressedRef.current = firePressed;

        const grabbedNodeId = grabbedNodeIdRef.current;
        if (!grabbedNodeId) {
            return;
        }

        const grabbedBody = runtime?.getBody(grabbedNodeId);
        if (!grabbedBody || grabbedBody.motionType !== MotionType.DYNAMIC) {
            restoreGrabbedMotionQuality();
            grabbedNodeIdRef.current = null;
            return;
        }

        state.camera.getWorldPosition(grabTargetPosition);
        state.camera.getWorldDirection(forwardVector);
        forwardVector.normalize();
        grabTargetPosition.addScaledVector(forwardVector, DEFAULT_GRAB_DISTANCE);
        state.camera.getWorldQuaternion(cameraWorldQuaternion);
        grabQuaternion.copy(cameraWorldQuaternion).multiply(grabbedRotationOffsetRef.current);

        grabBodyPosition.set(grabbedBody.position[0], grabbedBody.position[1], grabbedBody.position[2]);
        if (grabBodyPosition.distanceToSquared(grabTargetPosition) > DEFAULT_GRAB_RANGE * DEFAULT_GRAB_RANGE * 2.25) {
            restoreGrabbedMotionQuality();
            grabbedNodeIdRef.current = null;
            return;
        }

        grabVelocity
            .copy(grabTargetPosition)
            .sub(grabBodyPosition)
            .multiplyScalar(DEFAULT_GRAB_STRENGTH);

        if (grabVelocity.lengthSq() > DEFAULT_GRAB_MAX_SPEED * DEFAULT_GRAB_MAX_SPEED) {
            grabVelocity.setLength(DEFAULT_GRAB_MAX_SPEED);
        }

        rigidBody.setAngularVelocity(world, grabbedBody, [0, 0, 0]);
        rigidBody.setQuaternion(world, grabbedBody, [grabQuaternion.x, grabQuaternion.y, grabQuaternion.z, grabQuaternion.w], true);
        rigidBody.setLinearVelocity(world, grabbedBody, [grabVelocity.x, grabVelocity.y, grabVelocity.z]);
    }, -2);

    return null;
}

// useGLTF.preload(HAND_MODEL_URL);

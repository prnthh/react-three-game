"use client";

import { PerspectiveCamera, PointerLockControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { capsule, filter, kcc, rigidBody, MotionType, type Filter, type RigidBody } from "crashcat";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { useGameEvents, PrefabEditorMode, soundManager, usePrefab, useGameObject, useRegisterNodeComponent, useScene, useSceneComponents } from "react-three-game/viewer";
import type { Component, ComponentViewProps } from "react-three-game/viewer";
import { useCrashcat } from "react-three-game/plugins/crashcat";
import { MathUtils, Quaternion, Raycaster, Vector3 } from "three";
import type { Group, Intersection, Material, Object3D } from "three";
import { withBasePath } from "../../../basePath";
import type { NPCManagerRef } from "./NPCManager";
import { PLAYER_CONTROLLER_COMPONENT, type FirstPersonPlayerRef, type PlayerControllerProperties, type PlayerRegistration } from "./playerState";
import { createPlatformSupport } from "./platformSupport";
import { GrabArms, NPCAimSystem } from "./PlayerInteractions";

const DEFAULT_FLOOR_MATERIAL_NAME = "default";
const DEFAULT_FOOTSTEP_CLIPS = ["/sound/hit.mp3", "/sound/hit2.mp3"] as const;
const DEFAULT_FOOTSTEP_MATERIAL_SOUNDS = [
    { materialName: "concrete", clips: ["/sound/hit.mp3"] },
    { materialName: "metal", clips: ["/sound/hit2.mp3"] },
] as const;
const DEFAULT_TARGET_DISTANCE = 30;
const DEFAULT_NPC_DAMAGE = 100;
const CAMERA_SWAY_AMOUNT = 0.045;
const CAMERA_SWAY_LERP = 10;
const GRAVITY: [number, number, number] = [0, -9.81, 0];
const PLAYER_FIXED_STEP = 1 / 60;
const MAX_PLAYER_CATCH_UP_DELTA = 1 / 10;
const SUPPORT_RAY_EXTRA_DISTANCE = 0.2;
const PLAYER_ID = "player";
const forwardVector = new Vector3();
const rightVector = new Vector3();
const wishVector = new Vector3();
const planarVelocityVector = new Vector3();
const planarVelocityDelta = new Vector3();
const worldUp = new Vector3(0, 1, 0);
const groupPosition = new Vector3();
const identityQuaternion = new Quaternion();
const floorRaycaster = new Raycaster();
const floorRayOrigin = new Vector3();
const floorRayDirection = new Vector3(0, -1, 0);
const floorHits: Intersection<Object3D>[] = [];
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
    footstepMaterialSounds?: readonly FootstepMaterialSound[];
    defaultFootstepClips?: readonly string[];
    cameraHeight?: number;
    spawnPosition?: [number, number, number];
    npcManager?: NPCManagerRef | null;
    targetDistance?: number;
    npcDamage?: number;
    gravityGun?: boolean;
    onAimTargetChange?: (canHit: boolean) => void;
    pointerLockSelector?: string;
    children?: React.ReactNode;
};

export type FootstepMaterialSound = {
    materialName: string;
    clips: readonly string[];
};

function PlayerControllerView({ properties, children }: ComponentViewProps<PlayerControllerProperties>) {
    const gameObject = useGameObject();
    const { mode } = useScene();
    const playerRuntime = useRef<FirstPersonPlayerRef | null>(null);
    const registration = useMemo<PlayerRegistration>(() => ({
        ...properties,
        runtime: playerRuntime,
        getPosition: () => {
            const object = gameObject.transform;
            if (!object) return [0, 0, 0];
            object.updateWorldMatrix(true, false);
            object.getWorldPosition(groupPosition);
            return [groupPosition.x, groupPosition.y, groupPosition.z];
        },
    }), [gameObject, properties]);
    useRegisterNodeComponent(PLAYER_CONTROLLER_COMPONENT, registration);
    return <>
        {mode === PrefabEditorMode.Edit ? (
            <mesh position={[0, properties.halfHeightOfCylinder, 0]} renderOrder={1000}>
                <capsuleGeometry args={[properties.radius, (properties.halfHeightOfCylinder) * 2, 8, 12]} />
                <meshBasicMaterial color="#3bd6ff" depthTest={false} transparent opacity={0.8} wireframe />
            </mesh>
        ) : null}
        {children}
    </>;
}

export const PlayerControllerComponent: Component<PlayerControllerProperties> = {
    name: "KillboxPlayer",
    View: PlayerControllerView,
    properties: {
        radius: { default: 0.35, min: 0.05, step: 0.05 },
        halfHeightOfCylinder: { default: 0.45, label: "Body Half Height", min: 0.05, step: 0.05 },
        maxSpeed: { default: 7, min: 0, step: 0.5 },
        jumpSpeed: { default: 6.5, min: 0, step: 0.5 },
        cameraHeight: { default: 0.54, step: 0.05 },
    },
};

type PlayerRuntimeProps = Omit<FirstPersonPlayerProps,
    "radius" | "halfHeightOfCylinder" | "maxSpeed" | "jumpSpeed" | "cameraHeight" | "spawnPosition"
>;

export function PlayerRuntime(props: PlayerRuntimeProps) {
    const players = useSceneComponents(PLAYER_CONTROLLER_COMPONENT);
    const player = players[0]?.value;
    const spawnPosition = useMemo(() => player?.getPosition(), [player]);
    if (!player) return null;
    return <FirstPersonPlayer
        {...props}
        ref={player.runtime}
        radius={player.radius}
        halfHeightOfCylinder={player.halfHeightOfCylinder}
        maxSpeed={player.maxSpeed}
        jumpSpeed={player.jumpSpeed}
        cameraHeight={player.cameraHeight}
        spawnPosition={spawnPosition}
    />;
}

function moveVectorToward(current: Vector3, target: Vector3, maxDelta: number) {
    planarVelocityDelta.copy(target).sub(current);
    const distance = planarVelocityDelta.length();
    if (distance <= maxDelta || distance <= 1e-6) {
        current.copy(target);
        return;
    }
    current.addScaledVector(planarVelocityDelta, maxDelta / distance);
}

function getIntersectionMaterialName(intersection: Intersection<Object3D>) {
    const object = intersection.object as Object3D & { material?: Material | Material[] };
    const materialIndex = intersection.face?.materialIndex ?? 0;
    const material = Array.isArray(object.material) ? object.material[materialIndex] ?? object.material[0] : object.material;
    return (material?.name || DEFAULT_FLOOR_MATERIAL_NAME).trim().toLowerCase();
}

function raycastGroundMaterialName(root: Object3D | null, position: readonly number[], maxDistance: number) {
    if (!root) return DEFAULT_FLOOR_MATERIAL_NAME;

    floorRayOrigin.set(position[0], position[1], position[2]);
    floorRaycaster.set(floorRayOrigin, floorRayDirection);
    floorRaycaster.near = 0;
    floorRaycaster.far = maxDistance;
    floorHits.length = 0;
    const hit = floorRaycaster.intersectObject(root, true, floorHits)[0];
    return hit ? getIntersectionMaterialName(hit) : DEFAULT_FLOOR_MATERIAL_NAME;
}

function resolveFootstepClips(
    materialName: string,
    mappings: readonly FootstepMaterialSound[],
    fallback: readonly string[],
) {
    return mappings.find(entry => entry.materialName.trim().toLowerCase() === materialName)?.clips ?? fallback;
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
    footstepMaterialSounds = DEFAULT_FOOTSTEP_MATERIAL_SOUNDS,
    defaultFootstepClips = DEFAULT_FOOTSTEP_CLIPS,
    cameraHeight = 0.54,
    spawnPosition = [0, 1.3, 6],
    npcManager,
    targetDistance = DEFAULT_TARGET_DISTANCE,
    npcDamage = DEFAULT_NPC_DAMAGE,
    gravityGun = false,
    onAimTargetChange,
    pointerLockSelector,
    children,
}, ref) {
    const scene = useScene();
    const gameEvents = useGameEvents();
    const prefab = usePrefab();
    const playerObject = useGameObject(PLAYER_ID);
    const mode = scene.mode;
    const runtime = useCrashcat();
    const playerGroupRef = useRef<Group>(null);
    const cameraSwayRef = useRef<Group>(null);
    const planarVelocityRef = useRef(new Vector3());
    const simulationAccumulatorRef = useRef(0);
    const previousSimulationPositionRef = useRef(new Vector3());
    const currentSimulationPositionRef = useRef(new Vector3());
    const groundedRef = useRef(false);
    const footstepTimerRef = useRef(0);
    const characterRef = useRef<ReturnType<typeof kcc.create> | null>(null);
    const updateSettingsRef = useRef(kcc.createDefaultUpdateSettings());
    const pressedKeysRef = useRef(new Set<string>());
    const jumpQueuedRef = useRef(false);
    const characterFilterRef = useRef<Filter | null>(null);
    const playerBodyRef = useRef<RigidBody | null>(null);
    const characterBodyFilterRef = useRef((body: RigidBody) => body !== playerBodyRef.current && !body.sensor);
    const platformSupport = useMemo(createPlatformSupport, []);
    const nextFootstepAudioRef = useRef(0);
    const currentGroundMaterialNameRef = useRef(DEFAULT_FLOOR_MATERIAL_NAME);

    useImperativeHandle(ref, () => ({
        getBody: () => playerBodyRef.current,
    }), []);

    const resetPlayerState = useCallback(() => {
        characterRef.current = null;
        characterFilterRef.current = null;
        planarVelocityRef.current.set(0, 0, 0);
        simulationAccumulatorRef.current = 0;
        previousSimulationPositionRef.current.set(0, 0, 0);
        currentSimulationPositionRef.current.set(0, 0, 0);
        groundedRef.current = false;
        footstepTimerRef.current = 0;
        jumpQueuedRef.current = false;
        pressedKeysRef.current.clear();
        platformSupport.clear();
        currentGroundMaterialNameRef.current = DEFAULT_FLOOR_MATERIAL_NAME;
    }, [platformSupport]);

    useEffect(() => {
        if (mode === PrefabEditorMode.Play) {
            return;
        }

        resetPlayerState();
    }, [mode, resetPlayerState]);

    useEffect(() => {
        if (mode !== PrefabEditorMode.Play) return;

        const setKey = (down: boolean) => (event: KeyboardEvent) => {
            if (down && !document.pointerLockElement) return;
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
        document.addEventListener("pointerlockchange", clearInput);
        window.addEventListener("contextmenu", handleContextMenu);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", clearInput);
            document.removeEventListener("pointerlockchange", clearInput);
            window.removeEventListener("contextmenu", handleContextMenu);
        };
    }, [mode]);

    useEffect(() => {
        const clips = new Set([
            ...defaultFootstepClips,
            ...footstepMaterialSounds.flatMap(entry => entry.clips),
        ]);
        clips.forEach((clip) => {
            void soundManager.load(clip, withBasePath(clip)).catch(() => { });
        });
    }, [defaultFootstepClips, footstepMaterialSounds]);

    const playFootstepSound = () => {
        const clips = resolveFootstepClips(
            currentGroundMaterialNameRef.current,
            footstepMaterialSounds,
            defaultFootstepClips,
        );
        if (clips.length === 0) return;
        const clip = clips[nextFootstepAudioRef.current % clips.length];
        nextFootstepAudioRef.current += 1;
        if (!soundManager.hasBuffer(clip)) {
            return;
        }

        soundManager.playSync(clip, {
            volume: 0.1 + Math.random() * 0.05,
            pitch: 0.9 + Math.random() * 0.14,
        });
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
            userData: { nodeId: playerObject.id },
        });

        return () => {
            if (!playerBodyRef.current) {
                return;
            }

            rigidBody.remove(world, playerBodyRef.current);
            playerBodyRef.current = null;
        };
    }, [halfHeightOfCylinder, mode, playerObject.id, radius, runtime, spawnPosition]);

    useFrame((state, delta) => {
        if (mode !== PrefabEditorMode.Play) {
            return;
        }

        const frameDelta = Math.min(delta, MAX_PLAYER_CATCH_UP_DELTA);

        const keys = pressedKeysRef.current;
        const forwardInput = Number(pressed(keys, forwardKeys)) - Number(pressed(keys, backwardKeys));
        const rightInput = Number(pressed(keys, rightKeys)) - Number(pressed(keys, leftKeys));

        const cameraSway = cameraSwayRef.current;
        if (cameraSway) {
            const targetSway = -rightInput * CAMERA_SWAY_AMOUNT;
            cameraSway.rotation.z = MathUtils.damp(cameraSway.rotation.z, targetSway, CAMERA_SWAY_LERP, frameDelta);
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
            previousSimulationPositionRef.current.set(...spawnPosition);
            currentSimulationPositionRef.current.set(...spawnPosition);
        }

        if (!characterFilterRef.current) {
            characterFilterRef.current = filter.forWorld(world);
            filter.copy(characterFilterRef.current, baseQueryFilter);
            characterFilterRef.current.bodyFilter = characterBodyFilterRef.current;
        }

        const character = characterRef.current;
        const characterFilter = characterFilterRef.current;

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

        const planarVelocity = planarVelocityRef.current;

        const hasMovementInput = wishVector.lengthSq() > 0;
        const desiredPlanarSpeed = hasMovementInput
            ? wishVector.normalize().multiplyScalar(maxSpeed)
            : wishVector.set(0, 0, 0);

        simulationAccumulatorRef.current = Math.min(
            simulationAccumulatorRef.current + frameDelta,
            MAX_PLAYER_CATCH_UP_DELTA,
        );
        const simulationSteps = Math.floor((simulationAccumulatorRef.current + 1e-9) / PLAYER_FIXED_STEP);
        const simulatedDelta = simulationSteps * PLAYER_FIXED_STEP;
        let grounded = groundedRef.current;
        const carry = platformSupport.carry(world, character);
        previousSimulationPositionRef.current.add(carry);
        currentSimulationPositionRef.current.add(carry);
        if (simulationSteps > 0) {
            kcc.refreshContacts(world, character, characterFilter, platformSupport.listener);
            grounded = kcc.isSupported(character);
        }
        for (let stepIndex = 0; stepIndex < simulationSteps; stepIndex += 1) {
            previousSimulationPositionRef.current.copy(currentSimulationPositionRef.current);
            platformSupport.capture(world, character);

            if (hasMovementInput) {
                const acceleration = grounded ? groundAccel : airAccel;
                moveVectorToward(planarVelocity, desiredPlanarSpeed, acceleration * PLAYER_FIXED_STEP);
            } else if (grounded) {
                planarVelocity.multiplyScalar(Math.exp(-friction * PLAYER_FIXED_STEP));
                if (planarVelocity.lengthSq() < 1e-6) planarVelocity.set(0, 0, 0);
            }

            const currentVelocityY = character.linearVelocity[1];
            const jumping = grounded && jumpQueuedRef.current;
            if (jumping) {
                character.linearVelocity[1] = (platformSupport.body?.motionProperties.linearVelocity[1] ?? 0) + jumpSpeed;
                jumpQueuedRef.current = false;
            } else {
                character.linearVelocity[1] = grounded
                    ? 0
                    : currentVelocityY + GRAVITY[1] * PLAYER_FIXED_STEP;
            }

            character.linearVelocity[0] = planarVelocity.x;
            character.linearVelocity[2] = planarVelocity.z;

            kcc.update(world, character, PLAYER_FIXED_STEP, GRAVITY, updateSettingsRef.current, platformSupport.listener, characterFilter);
            grounded = !jumping && kcc.isSupported(character);
            if (grounded) platformSupport.capture(world, character);
            else platformSupport.clear();
            currentSimulationPositionRef.current.set(character.position[0], character.position[1], character.position[2]);
        }
        simulationAccumulatorRef.current -= simulatedDelta;
        groundedRef.current = grounded;

        if (!grounded) currentGroundMaterialNameRef.current = DEFAULT_FLOOR_MATERIAL_NAME;
        planarVelocityVector.set(
            planarVelocity.x,
            0,
            planarVelocity.z,
        );

        const speed = planarVelocityVector.length();
        const moving = grounded && hasMovementInput && speed > footstepMinSpeed;

        if (!moving) {
            if (footstepTimerRef.current !== 0) {
                footstepTimerRef.current = 0;
            }
        } else {
            footstepTimerRef.current -= simulatedDelta;

            if (footstepTimerRef.current <= 0) {
                currentGroundMaterialNameRef.current = raycastGroundMaterialName(
                    prefab.root,
                    character.position,
                    halfHeightOfCylinder + radius + SUPPORT_RAY_EXTRA_DISTANCE,
                );
                gameEvents.emit(footstepEventName, {
                    sourceEntityId: playerObject.id,
                    sourceNodeId: playerObject.id,
                    speed,
                    floorMaterialName: currentGroundMaterialNameRef.current,
                });
                playFootstepSound();

                footstepTimerRef.current = footstepInterval + Math.random() * footstepRandomDelay;
            }
        }

        const interpolationAlpha = MathUtils.clamp(simulationAccumulatorRef.current / PLAYER_FIXED_STEP, 0, 1);
        groupPosition.lerpVectors(
            previousSimulationPositionRef.current,
            currentSimulationPositionRef.current,
            interpolationAlpha,
        );
        playerGroup.position.copy(groupPosition);
        playerGroup.quaternion.copy(identityQuaternion);
        playerGroup.updateMatrixWorld(true);

        if (playerBodyRef.current) {
            playerBodyPosition[0] = character.position[0];
            playerBodyPosition[1] = character.position[1];
            playerBodyPosition[2] = character.position[2];
            rigidBody.setPosition(world, playerBodyRef.current, playerBodyPosition, true);
            rigidBody.setQuaternion(world, playerBodyRef.current, playerBodyQuaternion, true);
            playerBodyVelocity[0] = character.linearVelocity[0];
            playerBodyVelocity[1] = character.linearVelocity[1];
            playerBodyVelocity[2] = character.linearVelocity[2];
            rigidBody.setLinearVelocity(world, playerBodyRef.current, playerBodyVelocity);
        }

    }, -0.5); // After physics: carry by the platform's completed movement.

    if (mode !== PrefabEditorMode.Play) {
        return null;
    }

    return (
        <group ref={playerGroupRef} position={spawnPosition}>
            <group position={[0, cameraHeight, 0]}>
                <group ref={cameraSwayRef}>
                    <PerspectiveCamera makeDefault fov={90} near={0.1} far={1000} />
                    <PointerLockControls makeDefault selector={pointerLockSelector} />
                </group>

                {gravityGun ? <GrabArms velocity={planarVelocityRef} /> : <NPCAimSystem
                    npcManager={npcManager}
                    playerBodyRef={playerBodyRef}
                    maxDistance={targetDistance}
                    damage={npcDamage}
                    onTargetChange={onAimTargetChange}
                />}
                {children}
            </group>
        </group>
    );
});


export default FirstPersonPlayer;

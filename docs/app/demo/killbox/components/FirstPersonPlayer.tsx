"use client";

import { PerspectiveCamera, PointerLockControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CastRayStatus, capsule, castRay, createClosestCastRayCollector, createDefaultCastRaySettings, filter, kcc, rigidBody, MotionQuality, MotionType, type Filter, type RigidBody, type World } from "crashcat";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type RefObject } from "react";
import { gameEvents, PrefabEditorMode, soundManager, usePrefab, useScene } from "react-three-game";
import { useCrashcat } from "react-three-game/plugins/crashcat";
import { MathUtils, Quaternion, Raycaster, Vector2, Vector3 } from "three";
import type { Camera, Group, Intersection, Material, Object3D } from "three";
import { withBasePath } from "../../../basePath";
import type { NPCPoolRef } from "./NPCPool";

const DEFAULT_FLOOR_MATERIAL_NAME = "default";
const DEFAULT_FOOTSTEP_CLIPS = ["/sound/hit.mp3", "/sound/hit2.mp3"] as const;
const DEFAULT_FOOTSTEP_MATERIAL_SOUNDS = [
    { materialName: "concrete", clips: ["/sound/hit.mp3"] },
    { materialName: "metal", clips: ["/sound/hit2.mp3"] },
] as const;
const DEFAULT_GRAB_DISTANCE = 2.75;
const DEFAULT_GRAB_RANGE = 8;
const DEFAULT_GRAB_STRENGTH = 18;
const DEFAULT_GRAB_MAX_SPEED = 14;
const DEFAULT_LAUNCH_SPEED = 18;
const DEFAULT_TARGET_DISTANCE = 30;
const DEFAULT_NPC_DAMAGE = 100;
const CAMERA_SWAY_AMOUNT = 0.045;
const CAMERA_SWAY_LERP = 10;
const GRAVITY: [number, number, number] = [0, -9.81, 0];
const PLAYER_FIXED_STEP = 1 / 60;
const MAX_PLAYER_CATCH_UP_DELTA = 1 / 10;
const SUPPORT_RAY_EXTRA_DISTANCE = 0.2;
const SUPPORT_RAY_DIRECTION: [number, number, number] = [0, -1, 0];
const PLAYER_ID = "player";
const forwardVector = new Vector3();
const rightVector = new Vector3();
const wishVector = new Vector3();
const planarVelocityVector = new Vector3();
const planarVelocityDelta = new Vector3();
const worldUp = new Vector3(0, 1, 0);
const groupPosition = new Vector3();
const identityQuaternion = new Quaternion();
const centerScreen = new Vector2(0, 0);
const raycaster = new Raycaster();
const aimRaycaster = new Raycaster();
const aimWorldPosition = new Vector3();
const aimWorldDirection = new Vector3();
const aimPhysicsCollector = createClosestCastRayCollector();
const aimPhysicsSettings = createDefaultCastRaySettings();
const aimPhysicsOrigin: [number, number, number] = [0, 0, 0];
const aimPhysicsDirection: [number, number, number] = [0, 0, -1];
const floorRaycaster = new Raycaster();
const floorRayOrigin = new Vector3();
const floorRayDirection = new Vector3(0, -1, 0);
const floorHits: Intersection<Object3D>[] = [];
const grabTargetPosition = new Vector3();
const grabBodyPosition = new Vector3();
const grabVelocity = new Vector3();
const grabQuaternion = new Quaternion();
const cameraWorldQuaternion = new Quaternion();
const supportCurrentPosition = new Vector3();
const supportRelativePosition = new Vector3();
const supportCurrentQuaternion = new Quaternion();
const supportPreviousQuaternion = new Quaternion();
const supportDeltaQuaternion = new Quaternion();
const supportRayCollector = createClosestCastRayCollector();
const supportRaySettings = createDefaultCastRaySettings();
const supportRayOrigin: [number, number, number] = [0, 0, 0];
const supportVelocity: [number, number, number] = [0, 0, 0];
const supportRotatedPosition: [number, number, number] = [0, 0, 0];
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
    npcPoolRef?: RefObject<NPCPoolRef | null>;
    targetDistance?: number;
    npcDamage?: number;
    onAimTargetChange?: (canHit: boolean) => void;
    children?: React.ReactNode;
};

export interface FirstPersonPlayerRef {
    getBody: () => RigidBody | null;
    getGroundMaterialName: () => string;
    getSimulationTick: () => number;
}

export type FootstepMaterialSound = {
    materialName: string;
    clips: readonly string[];
};

function moveVectorToward(current: Vector3, target: Vector3, maxDelta: number) {
    planarVelocityDelta.copy(target).sub(current);
    const distance = planarVelocityDelta.length();
    if (distance <= maxDelta || distance <= 1e-6) {
        current.copy(target);
        return;
    }
    current.addScaledVector(planarVelocityDelta, maxDelta / distance);
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

function getKinematicSupportBody(world: World, queryFilter: Filter, character: ReturnType<typeof kcc.create>, grounded: boolean, halfHeightOfCylinder: number, radius: number) {
    if (!grounded) {
        return null;
    }

    supportRayOrigin[0] = character.position[0];
    supportRayOrigin[1] = character.position[1];
    supportRayOrigin[2] = character.position[2];

    supportRayCollector.reset();
    castRay(world, supportRayCollector, supportRaySettings, supportRayOrigin, SUPPORT_RAY_DIRECTION, halfHeightOfCylinder + radius + SUPPORT_RAY_EXTRA_DISTANCE, queryFilter);

    if (supportRayCollector.hit.status !== CastRayStatus.COLLIDING) {
        return null;
    }

    const body = rigidBody.get(world, supportRayCollector.hit.bodyIdB);
    if (!body || body.motionType !== MotionType.KINEMATIC) {
        return null;
    }

    return body;
}

function readBodyVelocity(body: RigidBody | null) {
    supportVelocity[0] = body?.motionProperties.linearVelocity[0] ?? 0;
    supportVelocity[1] = body?.motionProperties.linearVelocity[1] ?? 0;
    supportVelocity[2] = body?.motionProperties.linearVelocity[2] ?? 0;
    return supportVelocity;
}

const FirstPersonPlayer = forwardRef<FirstPersonPlayerRef, FirstPersonPlayerProps>(function FirstPersonPlayer({
    radius = 0.35,
    halfHeightOfCylinder = 0.45,
    maxSpeed = 7,
    groundAccel = 18,
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
    npcPoolRef,
    targetDistance = DEFAULT_TARGET_DISTANCE,
    npcDamage = DEFAULT_NPC_DAMAGE,
    onAimTargetChange,
    children,
}, ref) {
    const scene = useScene();
    const prefab = usePrefab();
    const mode = scene.mode;
    const runtime = useCrashcat();
    const playerGroupRef = useRef<Group>(null);
    const cameraSwayRef = useRef<Group>(null);
    const planarVelocityRef = useRef(new Vector3());
    const simulationAccumulatorRef = useRef(0);
    const simulationTickRef = useRef(0);
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
    const characterBodyFilterRef = useRef((body: RigidBody) => body !== playerBodyRef.current);
    const lastSupportBodyIdRef = useRef<number | null>(null);
    const lastSupportQuaternionRef = useRef(new Quaternion());
    const nextFootstepAudioRef = useRef(0);
    const currentGroundMaterialNameRef = useRef(DEFAULT_FLOOR_MATERIAL_NAME);

    useImperativeHandle(ref, () => ({
        getBody: () => playerBodyRef.current,
        getGroundMaterialName: () => currentGroundMaterialNameRef.current,
        getSimulationTick: () => simulationTickRef.current,
    }), []);

    const resetPlayerState = useCallback(() => {
        characterRef.current = null;
        characterFilterRef.current = null;
        planarVelocityRef.current.set(0, 0, 0);
        simulationAccumulatorRef.current = 0;
        simulationTickRef.current = 0;
        previousSimulationPositionRef.current.set(0, 0, 0);
        currentSimulationPositionRef.current.set(0, 0, 0);
        groundedRef.current = false;
        footstepTimerRef.current = 0;
        jumpQueuedRef.current = false;
        pressedKeysRef.current.clear();
        lastSupportBodyIdRef.current = null;
        lastSupportQuaternionRef.current.identity();
        currentGroundMaterialNameRef.current = DEFAULT_FLOOR_MATERIAL_NAME;
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
        let currentSupportVelocity = supportVelocity;
        if (simulationSteps > 0) {
            kcc.refreshContacts(world, character, characterFilter);
            grounded = kcc.isSupported(character);
        }
        for (let stepIndex = 0; stepIndex < simulationSteps; stepIndex += 1) {
            previousSimulationPositionRef.current.copy(currentSimulationPositionRef.current);
            const supportBody = getKinematicSupportBody(world, characterFilter, character, grounded, halfHeightOfCylinder, radius);
            currentSupportVelocity = readBodyVelocity(supportBody);

            if (supportBody) {
                supportCurrentPosition.set(supportBody.position[0], supportBody.position[1], supportBody.position[2]);
                supportCurrentQuaternion.set(supportBody.quaternion[0], supportBody.quaternion[1], supportBody.quaternion[2], supportBody.quaternion[3]);

                if (lastSupportBodyIdRef.current === supportBody.id) {
                    supportDeltaQuaternion
                        .copy(supportCurrentQuaternion)
                        .multiply(supportPreviousQuaternion.copy(lastSupportQuaternionRef.current).invert());

                    supportRelativePosition
                        .set(character.position[0], character.position[1], character.position[2])
                        .sub(supportCurrentPosition)
                        .applyQuaternion(supportDeltaQuaternion)
                        .add(supportCurrentPosition);

                    supportRotatedPosition[0] = supportRelativePosition.x;
                    supportRotatedPosition[1] = supportRelativePosition.y;
                    supportRotatedPosition[2] = supportRelativePosition.z;
                    kcc.setPosition(world, character, supportRotatedPosition);
                }

                lastSupportBodyIdRef.current = supportBody.id;
                lastSupportQuaternionRef.current.copy(supportCurrentQuaternion);
            } else {
                lastSupportBodyIdRef.current = null;
            }

            if (grounded) {
                if (hasMovementInput) {
                    moveVectorToward(planarVelocity, desiredPlanarSpeed, groundAccel * PLAYER_FIXED_STEP);
                } else {
                    planarVelocity.multiplyScalar(Math.exp(-friction * PLAYER_FIXED_STEP));
                    if (planarVelocity.lengthSq() < 1e-6) planarVelocity.set(0, 0, 0);
                }
            }

            const currentVelocityY = character.linearVelocity[1];
            if (grounded && jumpQueuedRef.current) {
                character.linearVelocity[1] = currentSupportVelocity[1] + jumpSpeed;
                jumpQueuedRef.current = false;
            } else {
                character.linearVelocity[1] = grounded
                    ? currentSupportVelocity[1]
                    : currentVelocityY + GRAVITY[1] * PLAYER_FIXED_STEP;
            }

            character.linearVelocity[0] = planarVelocity.x + currentSupportVelocity[0];
            character.linearVelocity[2] = planarVelocity.z + currentSupportVelocity[2];

            kcc.update(world, character, PLAYER_FIXED_STEP, GRAVITY, updateSettingsRef.current, undefined, characterFilter);
            grounded = kcc.isSupported(character);
            currentSimulationPositionRef.current.set(character.position[0], character.position[1], character.position[2]);
            simulationTickRef.current += 1;
        }
        simulationAccumulatorRef.current -= simulatedDelta;
        groundedRef.current = grounded;

        if (!grounded) currentGroundMaterialNameRef.current = DEFAULT_FLOOR_MATERIAL_NAME;
        const supportBody = getKinematicSupportBody(world, characterFilter, character, grounded, halfHeightOfCylinder, radius);
        currentSupportVelocity = readBodyVelocity(supportBody);
        planarVelocityVector.set(
            planarVelocity.x + currentSupportVelocity[0],
            0,
            planarVelocity.z + currentSupportVelocity[2],
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
                    sourceEntityId: PLAYER_ID,
                    sourceNodeId: PLAYER_ID,
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
                <NPCAimSystem
                    npcPoolRef={npcPoolRef}
                    playerBodyRef={playerBodyRef}
                    maxDistance={targetDistance}
                    damage={npcDamage}
                    onTargetChange={onAimTargetChange}
                />
                {children}
            </group>
        </group>
    );
});


export default FirstPersonPlayer;

type NPCAimSystemProps = {
    npcPoolRef?: RefObject<NPCPoolRef | null>;
    playerBodyRef: RefObject<RigidBody | null>;
    maxDistance: number;
    damage: number;
    onTargetChange?: (canHit: boolean) => void;
};

function NPCAimSystem({ npcPoolRef, playerBodyRef, maxDistance, damage, onTargetChange }: NPCAimSystemProps) {
    const { mode } = useScene();
    const runtime = useCrashcat();
    const cameraRef = useRef<Camera | null>(null);
    const canHitRef = useRef(false);
    const aimFilterRef = useRef<Filter | null>(null);
    const aimBodyFilterRef = useRef((body: RigidBody) => {
        if (body === playerBodyRef.current) return false;
        const nodeId = (body.userData as { nodeId?: unknown } | undefined)?.nodeId;
        return typeof nodeId !== "string" || !nodeId.endsWith("-navigation");
    });

    const updateTarget = useCallback((canHit: boolean) => {
        if (canHitRef.current === canHit) return;
        canHitRef.current = canHit;
        onTargetChange?.(canHit);
    }, [onTargetChange]);

    const findVisibleTarget = useCallback((camera: Camera) => {
        const npcPool = npcPoolRef?.current;
        if (!npcPool) return null;

        aimRaycaster.setFromCamera(centerScreen, camera);
        const npcHit = npcPool.raycast(aimRaycaster, maxDistance);
        if (!npcHit) return null;

        const world = runtime?.world;
        const baseFilter = runtime?.queryFilter;
        if (!world || !baseFilter) return npcHit;

        if (!aimFilterRef.current) {
            aimFilterRef.current = filter.forWorld(world);
            filter.copy(aimFilterRef.current, baseFilter);
            aimFilterRef.current.bodyFilter = aimBodyFilterRef.current;
        }
        camera.getWorldPosition(aimWorldPosition);
        camera.getWorldDirection(aimWorldDirection).normalize();
        aimPhysicsOrigin[0] = aimWorldPosition.x;
        aimPhysicsOrigin[1] = aimWorldPosition.y;
        aimPhysicsOrigin[2] = aimWorldPosition.z;
        aimPhysicsDirection[0] = aimWorldDirection.x;
        aimPhysicsDirection[1] = aimWorldDirection.y;
        aimPhysicsDirection[2] = aimWorldDirection.z;
        aimPhysicsCollector.reset();
        castRay(world, aimPhysicsCollector, aimPhysicsSettings, aimPhysicsOrigin, aimPhysicsDirection, npcHit.distance, aimFilterRef.current);
        if (aimPhysicsCollector.hit.status !== CastRayStatus.COLLIDING) return npcHit;
        return Number(aimPhysicsCollector.hit.bodyIdB) === npcHit.bodyId ? npcHit : null;
    }, [maxDistance, npcPoolRef, runtime]);

    useEffect(() => {
        if (mode !== PrefabEditorMode.Play) {
            updateTarget(false);
            return;
        }

        const handleMouseDown = (event: MouseEvent) => {
            if (event.button !== 0) return;
            const npcPool = npcPoolRef?.current;
            const camera = cameraRef.current;
            if (!npcPool || !camera) return;
            const hit = findVisibleTarget(camera);
            if (hit) npcPool.damage(hit, damage);
        };

        window.addEventListener("mousedown", handleMouseDown);
        return () => {
            window.removeEventListener("mousedown", handleMouseDown);
            updateTarget(false);
        };
    }, [damage, findVisibleTarget, mode, npcPoolRef, updateTarget]);

    useFrame((state) => {
        cameraRef.current = state.camera;
        if (mode !== PrefabEditorMode.Play) return;
        updateTarget(Boolean(findVisibleTarget(state.camera)));
    }, -1);

    return null;
}

const GrabArms = () => {
    const { mode } = useScene();
    const prefab = usePrefab();
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
        const prefabRoot = prefab.root;
        if (!prefabRoot) return;

        raycaster.setFromCamera(centerScreen, camera);

        // The grab ray is camera-centered, but picking stays scoped to authored prefab content.
        const intersections = raycaster.intersectObject(prefabRoot, true);
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
    }, [prefab.root, runtime]);

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

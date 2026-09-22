import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { CastRayStatus, castRay, createClosestCastRayCollector, createDefaultCastRaySettings, filter, rigidBody, MotionQuality, MotionType, type Filter, type RigidBody, type World } from "crashcat";
import { PrefabEditorMode, usePrefab, useScene } from "react-three-game/viewer";
import { useCrashcat } from "react-three-game/plugins/crashcat";
import { Quaternion, Raycaster, Vector2, Vector3, type Camera, type Object3D } from "three";
import type { NPCManagerRef } from "./NPCManager";
import { bindGravityGunInput } from "./gravityGunInput";

const PLAYER_ID = "player";
const forwardVector = new Vector3();
const DEFAULT_GRAB_DISTANCE = 2.75;
const DEFAULT_GRAB_RANGE = 8;
const DEFAULT_GRAB_STRENGTH = 18;
const DEFAULT_GRAB_MAX_SPEED = 14;
const DEFAULT_LAUNCH_SPEED = 18;
const RAGDOLL_GRAB_STRENGTH = 10;
const RAGDOLL_GRAB_MAX_SPEED = 6;
const RAGDOLL_LAUNCH_SPEED = 10;
const RAGDOLL_ANGULAR_RETENTION = 0.25;
const centerScreen = new Vector2(0, 0);
const raycaster = new Raycaster();
const aimRaycaster = new Raycaster();
const aimWorldPosition = new Vector3();
const aimWorldDirection = new Vector3();
const aimPhysicsCollector = createClosestCastRayCollector();
const aimPhysicsSettings = createDefaultCastRaySettings();
const aimPhysicsOrigin: [number, number, number] = [0, 0, 0];
const aimPhysicsDirection: [number, number, number] = [0, 0, -1];
const grabTargetPosition = new Vector3();
const grabBodyPosition = new Vector3();
const grabVelocity = new Vector3();
const grabQuaternion = new Quaternion();
const grabLinearVelocity: [number, number, number] = [0, 0, 0];
const grabAngularVelocity: [number, number, number] = [0, 0, 0];
const grabRotation: [number, number, number, number] = [0, 0, 0, 1];
const zeroGrabVelocity: [number, number, number] = [0, 0, 0];
const cameraWorldQuaternion = new Quaternion();
function isRagdollBody(body: RigidBody) {
    return (body.userData as { ragdoll?: unknown } | null)?.ragdoll === true;
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


type NPCAimSystemProps = {
    npcManager?: NPCManagerRef | null;
    playerBodyRef: RefObject<RigidBody | null>;
    maxDistance: number;
    damage: number;
    onTargetChange?: (canHit: boolean) => void;
};

export function NPCAimSystem({ npcManager, playerBodyRef, maxDistance, damage, onTargetChange }: NPCAimSystemProps) {
    const { mode } = useScene();
    const runtime = useCrashcat();
    const cameraRef = useRef<Camera | null>(null);
    const canHitRef = useRef(false);
    const aimFilterRef = useRef<Filter | null>(null);
    const aimBodyFilterRef = useRef((body: RigidBody) => {
        if (body === playerBodyRef.current || body.sensor) return false;
        const nodeId = (body.userData as { nodeId?: unknown } | undefined)?.nodeId;
        return typeof nodeId !== "string" || !nodeId.endsWith("-navigation");
    });

    const updateTarget = useCallback((canHit: boolean) => {
        if (canHitRef.current === canHit) return;
        canHitRef.current = canHit;
        onTargetChange?.(canHit);
    }, [onTargetChange]);

    const findVisibleTarget = useCallback((camera: Camera) => {
        if (!npcManager) return null;

        aimRaycaster.setFromCamera(centerScreen, camera);
        const npcHit = npcManager.raycast(aimRaycaster, maxDistance);
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
    }, [maxDistance, npcManager, runtime]);

    useEffect(() => {
        if (mode !== PrefabEditorMode.Play) {
            updateTarget(false);
            return;
        }

        const handleMouseDown = (event: MouseEvent) => {
            if (event.button !== 0 || !document.pointerLockElement) return;
            const camera = cameraRef.current;
            if (!npcManager || !camera) return;
            const hit = findVisibleTarget(camera);
            if (hit) npcManager.damage(hit, damage);
        };

        window.addEventListener("mousedown", handleMouseDown);
        return () => {
            window.removeEventListener("mousedown", handleMouseDown);
            updateTarget(false);
        };
    }, [damage, findVisibleTarget, mode, npcManager, updateTarget]);

    useFrame((state) => {
        cameraRef.current = state.camera;
        if (mode !== PrefabEditorMode.Play) return;
        updateTarget(Boolean(findVisibleTarget(state.camera)));
    }, -1);

    return null;
}

export function GrabArms({ velocity }: { velocity: RefObject<Vector3> }) {
    const { mode } = useScene();
    const prefab = usePrefab();
    const runtime = useCrashcat();

    const grabbedNodeIdRef = useRef<string | null>(null);
    const grabbedMotionQualityRef = useRef<MotionQuality | null>(null);
    const grabbedRotationOffsetRef = useRef(new Quaternion());
    const throwRequested = useRef(false);
    const grabRequested = useRef(false);

    const resetGrabState = useCallback(() => {
        grabbedNodeIdRef.current = null;
        grabbedMotionQualityRef.current = null;
        grabbedRotationOffsetRef.current.identity();
        throwRequested.current = false;
        grabRequested.current = false;
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

    useEffect(() => () => restoreGrabbedMotionQuality(), [restoreGrabbedMotionQuality]);

    useEffect(() => {
        if (mode === PrefabEditorMode.Play) {
            return;
        }

        restoreGrabbedMotionQuality();
        resetGrabState();
    }, [mode, resetGrabState, restoreGrabbedMotionQuality]);

    useEffect(() => {
        if (mode !== PrefabEditorMode.Play) return;

        return bindGravityGunInput(window, document, {
            grab: () => { grabRequested.current = true; },
            throw: () => { throwRequested.current = true; },
            clear: () => {
                throwRequested.current = false;
                grabRequested.current = false;
            },
            drop: () => {
                restoreGrabbedMotionQuality();
                grabbedNodeIdRef.current = null;
            },
        });
    }, [mode, restoreGrabbedMotionQuality]);

    const releaseGrabbed = useCallback((world: World, camera: Camera, launch = false) => {
        const grabbedNodeId = grabbedNodeIdRef.current;
        if (!grabbedNodeId) {
            return;
        }

        const body = runtime?.getBody(grabbedNodeId) ?? null;
        if (body && launch) {
            camera.getWorldDirection(forwardVector);
            forwardVector.normalize();
            grabVelocity.copy(forwardVector).multiplyScalar(
                isRagdollBody(body) ? RAGDOLL_LAUNCH_SPEED : DEFAULT_LAUNCH_SPEED,
            );
            grabVelocity.add(velocity.current);
            rigidBody.setAngularVelocity(world, body, zeroGrabVelocity);
            grabVelocity.toArray(grabLinearVelocity);
            rigidBody.setLinearVelocity(world, body, grabLinearVelocity);
        }

        restoreGrabbedMotionQuality();
        grabbedNodeIdRef.current = null;
    }, [restoreGrabbedMotionQuality, runtime, velocity]);

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

        const toggleGrab = grabRequested.current;
        const throwObject = throwRequested.current;
        grabRequested.current = false;
        throwRequested.current = false;

        if (toggleGrab) {
            if (grabbedNodeIdRef.current) {
                releaseGrabbed(world, state.camera, false);
            } else {
                tryGrabTarget(world, state.camera);
            }
        }

        if (throwObject && grabbedNodeIdRef.current) {
            releaseGrabbed(world, state.camera, true);
        }


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

        const ragdoll = isRagdollBody(grabbedBody);
        grabVelocity
            .copy(grabTargetPosition)
            .sub(grabBodyPosition)
            .multiplyScalar(ragdoll ? RAGDOLL_GRAB_STRENGTH : DEFAULT_GRAB_STRENGTH);

        const maxGrabSpeed = ragdoll ? RAGDOLL_GRAB_MAX_SPEED : DEFAULT_GRAB_MAX_SPEED;
        if (grabVelocity.lengthSq() > maxGrabSpeed * maxGrabSpeed) {
            grabVelocity.setLength(maxGrabSpeed);
        }

        if (ragdoll) {
            const angularVelocity = grabbedBody.motionProperties.angularVelocity;
            grabAngularVelocity[0] = angularVelocity[0] * RAGDOLL_ANGULAR_RETENTION;
            grabAngularVelocity[1] = angularVelocity[1] * RAGDOLL_ANGULAR_RETENTION;
            grabAngularVelocity[2] = angularVelocity[2] * RAGDOLL_ANGULAR_RETENTION;
            rigidBody.setAngularVelocity(world, grabbedBody, grabAngularVelocity);
        } else {
            rigidBody.setAngularVelocity(world, grabbedBody, zeroGrabVelocity);
            grabQuaternion.toArray(grabRotation);
            rigidBody.setQuaternion(world, grabbedBody, grabRotation, true);
        }
        grabVelocity.toArray(grabLinearVelocity);
        rigidBody.setLinearVelocity(world, grabbedBody, grabLinearVelocity);
    }, -2);

    return null;
}

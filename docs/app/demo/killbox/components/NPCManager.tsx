"use client";

import { useFrame } from "@react-three/fiber";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
    ANIMATED_MODEL_COMPONENT,
    createNodeComponentType,
    PrefabEditorMode,
    useRegisterNodeComponent,
    useScene,
    useSceneComponents,
} from "react-three-game";
import type { AnimatedModelHandle, Component, ComponentViewProps, SceneComponent } from "react-three-game";
import {
    box,
    capsule,
    castRay,
    CastRayStatus,
    ConstraintSpace,
    createClosestCastRayCollector,
    createDefaultCastRaySettings,
    filter,
    MotionType,
    rigidBody,
    swingTwistConstraint,
    type Filter,
    type RigidBody,
    type SwingTwistConstraint,
} from "crashcat";
import { quat, vec3, type Vec3 } from "mathcat";
import {
    Bone,
    Box3,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    Quaternion,
    Ray,
    Raycaster,
    Vector3,
    type Object3D,
} from "three";

import { getActivePlayer, PLAYER_CONTROLLER_COMPONENT } from "./FirstPersonPlayer";
import { useCrashcat, type CrashcatApi } from "react-three-game/plugins/crashcat";

const DEFAULT_NPC_SCALE = 0.92;
const DEFAULT_NPC_SPEED = 1.15;
const NPC_STOP_DISTANCE = 1.5;
const NPC_IDLE_MIN_DURATION = 1.5;
const NPC_IDLE_MAX_DURATION = 4;
const NPC_WANDER_MIN_DISTANCE = 2.5;
const NPC_WANDER_MAX_DISTANCE = 6;
const NPC_WANDER_GOAL_DISTANCE = 0.45;
const NPC_WANDER_TIMEOUT = 9;
const NPC_TURN_RESPONSE = 6.5;
const NPC_HITBOX_SYNC_INTERVAL = 1 / 30;
const NPC_NAVIGATION_RADIUS = 0.34;
const NPC_NAVIGATION_HALF_HEIGHT = 0.48;
const NPC_NAVIGATION_CENTER_HEIGHT = NPC_NAVIGATION_RADIUS + NPC_NAVIGATION_HALF_HEIGHT;
const NPC_NAVIGATION_SPACING = NPC_NAVIGATION_RADIUS * 2 + 0.08;
const NPC_OBSTACLE_PROBE_LENGTH = 1.35;
const NPC_OBSTACLE_TURN_ANGLE = Math.PI * 0.38;
const DEFAULT_NPC_HP = 200;
const DEFAULT_RAGDOLL_LIFETIME = 8;
const NPC_RAGDOLL_MAX_LINEAR_VELOCITY = 10;
const NPC_RAGDOLL_MAX_ANGULAR_VELOCITY = 14;
const partStart = new Vector3();
const partEnd = new Vector3();
const partDirection = new Vector3();
const partQuaternion = new Quaternion();
const bodyPosition = new Vector3();
const parentQuaternion = new Quaternion();
const inverseQuaternion = new Quaternion();
const desiredBoneQuaternion = new Quaternion();
const desiredBonePosition = new Vector3();
const bodyMatrix = new Matrix4();
const inverseBodyMatrix = new Matrix4();
const localHitPoint = new Vector3();
const worldHitPoint = new Vector3();
const objectWorldPosition = new Vector3();
const objectLocalPosition = new Vector3();
const localRay = new Ray();
const unitScale = new Vector3(1, 1, 1);
const localBodyBox = new Box3();
const navigationProbeCollector = createClosestCastRayCollector();
const navigationProbeSettings = createDefaultCastRaySettings();
const navigationProbeOrigin: [number, number, number] = [0, 0, 0];
const navigationProbeDirection: [number, number, number] = [0, 0, 1];
const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_Z = new Vector3(0, 0, 1);

export type NPCBodyPart = "head" | "torso" | "hips"
    | "leftUpperArm" | "leftLowerArm" | "rightUpperArm" | "rightLowerArm"
    | "leftUpperLeg" | "leftLowerLeg" | "rightUpperLeg" | "rightLowerLeg";

type BodyPartDefinition = {
    bone: string;
    endBone: string;
    axis: "x" | "y";
    halfExtents: readonly [number, number, number];
    parent: NPCBodyPart | null;
};

const BODY_PARTS: Record<NPCBodyPart, BodyPartDefinition> = {
    hips: { bone: "mixamorigHips", endBone: "mixamorigSpine", axis: "y", halfExtents: [0.23, 0.12, 0.15], parent: null },
    torso: { bone: "mixamorigSpine1", endBone: "mixamorigNeck", axis: "y", halfExtents: [0.19, 0.22, 0.12], parent: "hips" },
    head: { bone: "mixamorigHead", endBone: "mixamorigHeadTop_End", axis: "y", halfExtents: [0.15, 0.18, 0.15], parent: "torso" },
    leftUpperArm: { bone: "mixamorigLeftArm", endBone: "mixamorigLeftForeArm", axis: "x", halfExtents: [0.2, 0.075, 0.075], parent: "torso" },
    leftLowerArm: { bone: "mixamorigLeftForeArm", endBone: "mixamorigLeftHand", axis: "x", halfExtents: [0.2, 0.07, 0.07], parent: "leftUpperArm" },
    rightUpperArm: { bone: "mixamorigRightArm", endBone: "mixamorigRightForeArm", axis: "x", halfExtents: [0.2, 0.075, 0.075], parent: "torso" },
    rightLowerArm: { bone: "mixamorigRightForeArm", endBone: "mixamorigRightHand", axis: "x", halfExtents: [0.2, 0.07, 0.07], parent: "rightUpperArm" },
    leftUpperLeg: { bone: "mixamorigLeftUpLeg", endBone: "mixamorigLeftLeg", axis: "y", halfExtents: [0.09, 0.25, 0.1], parent: "hips" },
    leftLowerLeg: { bone: "mixamorigLeftLeg", endBone: "mixamorigLeftFoot", axis: "y", halfExtents: [0.08, 0.25, 0.09], parent: "leftUpperLeg" },
    rightUpperLeg: { bone: "mixamorigRightUpLeg", endBone: "mixamorigRightLeg", axis: "y", halfExtents: [0.09, 0.25, 0.1], parent: "hips" },
    rightLowerLeg: { bone: "mixamorigRightLeg", endBone: "mixamorigRightFoot", axis: "y", halfExtents: [0.08, 0.25, 0.09], parent: "rightUpperLeg" },
};
const BODY_PART_ENTRIES = Object.entries(BODY_PARTS) as Array<[NPCBodyPart, BodyPartDefinition]>;

type NPCState = "idle" | "wander" | "chase" | "dead";
type NPCAnimState = "idle" | "walk" | "run";

export type NPCData = {
    id: string;
    position: readonly [number, number, number];
    model: AnimatedModelHandle;
    scale?: number;
    speed?: number;
    ragdollLifetime?: number;
    debugRagdoll?: boolean;
    maxHp?: number;
    hp?: number;
};

type StoredNPC = {
    id: string;
    position: Vector3;
    spawnPosition: Vector3;
    state: NPCState;
    animState: NPCAnimState;
    stateTime: number;
    idleDuration: number;
    wanderTarget: Vector3;
    randomState: number;
    hp: number;
    maxHp: number;
    model: AnimatedModelHandle;
    scale: number;
    speed: number;
    ragdollLifetime: number;
    debugRagdoll: boolean;
    avoidanceSign: -1 | 1;
    hitParts: Set<NPCBodyPart>;
    hiddenParts: Set<NPCBodyPart>;
};

type BoneRestTransform = {
    position: Vector3;
    quaternion: Quaternion;
    scale: Vector3;
};

type BoneBinding = {
    bone: Bone;
    endBone: Bone;
    positionOffset: Vector3;
    quaternionOffset: Quaternion;
};

type NPCRuntime = {
    data: StoredNPC;
    root: Object3D;
    model: AnimatedModelHandle;
    localPosition: Vector3;
    localQuaternion: Quaternion;
    localScale: Vector3;
    boneRestTransforms: Map<Bone, BoneRestTransform>;
    bindings: Map<NPCBodyPart, BoneBinding>;
    bodies: Map<NPCBodyPart, RigidBody>;
    navigationBody: RigidBody | null;
    navigationFilter: Filter | null;
    navigationDirection: Vector3;
    navigationBlocked: boolean;
    hitboxSyncAccumulator: number;
    constraints: SwingTwistConstraint[];
};

export type NPCHit = {
    npcId: string;
    bodyId: number;
    distance: number;
    point: Vector3;
    bodyPart: NPCBodyPart;
};

/** Runtime API exposed by the mounted NPCManager scene component. */
export type NPCManagerRef = {
    raycast: (raycaster: Raycaster, maxDistance: number) => NPCHit | null;
    damage: (hit: NPCHit, amount: number) => void;
};

type NPCSystemProps = {
    models: readonly SceneComponent<AnimatedModelHandle>[];
    settings: NPCManagerProperties;
};

type NPCManagerProperties = {
    scale?: number;
    maxHp?: number;
    speed?: number;
    ragdollLifetime?: number;
    debugRagdoll?: boolean;
};

export const NPC_MANAGER_COMPONENT = createNodeComponentType<NPCManagerRef>("NPCManager");

function NPCManagerView({ properties, children }: ComponentViewProps<NPCManagerProperties>) {
    const { mode } = useScene();
    const players = useSceneComponents(PLAYER_CONTROLLER_COMPONENT);
    const models = useSceneComponents(ANIMATED_MODEL_COMPONENT);
    const [manager, setManager] = useState<NPCManagerRef | null>(null);
    useRegisterNodeComponent(NPC_MANAGER_COMPONENT, manager);
    const playing = mode === PrefabEditorMode.Play;
    return <>
        {playing && players.length > 0 ? <NPCSystem ref={setManager} models={models} settings={properties} /> : null}
        {children}
    </>;
}

export const NPCManagerComponent: Component<NPCManagerProperties> = {
    name: "NPCManager",
    View: NPCManagerView,
    properties: {
        scale: { default: DEFAULT_NPC_SCALE, min: 0.01, step: 0.05 },
        maxHp: { default: DEFAULT_NPC_HP, label: "Max HP", min: 1, step: 10 },
        speed: { default: DEFAULT_NPC_SPEED, label: "Move Speed", min: 0, step: 0.1 },
        ragdollLifetime: { default: DEFAULT_RAGDOLL_LIFETIME, label: "Ragdoll Reset Delay", min: 0, step: 0.5 },
        debugRagdoll: { type: "boolean", default: false, label: "Debug Ragdoll Colliders" },
    },
};

function scaleDownBoneBranch(bone: Bone) {
    bone.traverse((child) => {
        if (child instanceof Bone) child.scale.setScalar(0);
    });
}

function restoreBoneScales(runtime: NPCRuntime) {
    runtime.boneRestTransforms.forEach((transform, bone) => bone.scale.copy(transform.scale));
}

function applyHitPartScales(runtime: NPCRuntime) {
    runtime.data.hiddenParts.forEach((part) => {
        const bone = runtime.bindings.get(part)?.bone;
        if (bone) scaleDownBoneBranch(bone);
    });
    runtime.root.updateMatrixWorld(true);
}

function hashNPCId(id: string) {
    let hash = 2166136261;
    for (const character of id) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0 || 1;
}

function nextNPCRandom(data: StoredNPC) {
    let value = data.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    data.randomState = value >>> 0 || 1;
    return data.randomState / 0x100000000;
}

function enterIdle(data: StoredNPC) {
    data.state = "idle";
    data.stateTime = 0;
    data.idleDuration = NPC_IDLE_MIN_DURATION
        + nextNPCRandom(data) * (NPC_IDLE_MAX_DURATION - NPC_IDLE_MIN_DURATION);
}

function requestWanderGoal(data: StoredNPC, origin: Vector3) {
    const angle = nextNPCRandom(data) * Math.PI * 2;
    const distance = NPC_WANDER_MIN_DISTANCE
        + nextNPCRandom(data) * (NPC_WANDER_MAX_DISTANCE - NPC_WANDER_MIN_DISTANCE);
    data.wanderTarget.set(
        origin.x + Math.sin(angle) * distance,
        origin.y,
        origin.z + Math.cos(angle) * distance,
    );
    data.state = "wander";
    data.stateTime = 0;
}

function dampAngle(current: number, target: number, response: number, delta: number) {
    const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    return current + difference * (1 - Math.exp(-response * delta));
}

function createStoredNPC(npc: NPCData): StoredNPC {
    const position = new Vector3(...npc.position);
    const maxHp = Math.max(1, npc.maxHp ?? DEFAULT_NPC_HP);
    const hp = Math.min(maxHp, Math.max(0, npc.hp ?? maxHp));
    const data: StoredNPC = {
        id: npc.id,
        position,
        spawnPosition: position.clone(),
        state: "idle",
        animState: "idle",
        stateTime: 0,
        idleDuration: NPC_IDLE_MIN_DURATION,
        wanderTarget: position.clone(),
        randomState: hashNPCId(npc.id),
        hp,
        maxHp,
        model: npc.model,
        scale: Math.max(0.01, npc.scale ?? DEFAULT_NPC_SCALE),
        speed: Math.max(0, npc.speed ?? DEFAULT_NPC_SPEED),
        ragdollLifetime: Math.max(0, npc.ragdollLifetime ?? DEFAULT_RAGDOLL_LIFETIME),
        debugRagdoll: npc.debugRagdoll ?? false,
        avoidanceSign: [...npc.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 2 === 0 ? 1 : -1,
        hitParts: new Set(),
        hiddenParts: new Set(),
    };
    enterIdle(data);
    return data;
}

function setNPCAnimState(runtime: NPCRuntime, animState: NPCAnimState, immediate = false) {
    if (runtime.data.animState === animState && !immediate) return;
    runtime.data.animState = animState;
    runtime.model.setAnimationState(animState, immediate);
}

function setObjectWorldPosition(object: Object3D, position: Vector3) {
    const parent = object.parent;
    if (!parent) {
        object.position.copy(position);
    } else {
        parent.updateWorldMatrix(true, false);
        objectLocalPosition.copy(position);
        parent.worldToLocal(objectLocalPosition);
        object.position.copy(objectLocalPosition);
    }
    object.updateMatrixWorld(true);
}

function resetRuntime(runtime: NPCRuntime) {
    const { data, root } = runtime;
    data.position.copy(data.spawnPosition);
    enterIdle(data);
    data.hp = data.maxHp;
    data.hitParts.clear();
    data.hiddenParts.clear();
    runtime.navigationDirection.set(0, 0, 1);
    runtime.navigationBlocked = false;
    runtime.hitboxSyncAccumulator = 0;
    runtime.boneRestTransforms.forEach((transform, bone) => {
        bone.position.copy(transform.position);
        bone.quaternion.copy(transform.quaternion);
        bone.scale.copy(transform.scale);
    });
    setObjectWorldPosition(root, data.position);
    setNPCAnimState(runtime, "idle", true);
    root.updateMatrixWorld(true);
}

function getTangent(axis: Vec3): Vec3 {
    const tangent = vec3.create();
    if (Math.abs(axis[0]) <= Math.abs(axis[1]) && Math.abs(axis[0]) <= Math.abs(axis[2])) {
        vec3.set(tangent, 0, -axis[2], axis[1]);
    } else if (Math.abs(axis[1]) <= Math.abs(axis[2])) {
        vec3.set(tangent, axis[2], 0, -axis[0]);
    } else {
        vec3.set(tangent, -axis[1], axis[0], 0);
    }
    return vec3.normalize(tangent, tangent);
}

function createNPCBodies(api: CrashcatApi, id: string, scale: number) {
    const bodies = new Map<NPCBodyPart, RigidBody>();
    for (const [part, definition] of BODY_PART_ENTRIES) {
        const halfExtents = definition.halfExtents.map(value => value * scale) as [number, number, number];
        const nodeId = `${id}-${part}`;
        const body = rigidBody.create(api.world, {
            shape: box.create({
                halfExtents: vec3.fromValues(...halfExtents),
                convexRadius: Math.min(...halfExtents) * 0.35,
                density: 1,
            }),
            objectLayer: api.movingObjectLayer,
            motionType: MotionType.KINEMATIC,
            position: vec3.create(),
            quaternion: quat.create(),
            collideKinematicVsNonDynamic: false,
            linearDamping: 0.24,
            angularDamping: 0.65,
            maxLinearVelocity: NPC_RAGDOLL_MAX_LINEAR_VELOCITY,
            maxAngularVelocity: NPC_RAGDOLL_MAX_ANGULAR_VELOCITY,
            userData: { nodeId, ragdoll: true },
        });
        api.register(nodeId, body, { motionType: MotionType.KINEMATIC, sensor: false });
        bodies.set(part, body);
    }
    return bodies;
}

function createNPCNavigationBody(api: CrashcatApi, runtime: NPCRuntime) {
    const nodeId = `${runtime.data.id}-navigation`;
    const body = rigidBody.create(api.world, {
        shape: capsule.create({
            radius: NPC_NAVIGATION_RADIUS,
            halfHeightOfCylinder: NPC_NAVIGATION_HALF_HEIGHT,
        }),
        objectLayer: api.movingObjectLayer,
        motionType: MotionType.KINEMATIC,
        position: [
            runtime.data.position.x,
            runtime.data.position.y + NPC_NAVIGATION_CENTER_HEIGHT,
            runtime.data.position.z,
        ],
        quaternion: [0, 0, 0, 1],
        collideKinematicVsNonDynamic: true,
        friction: 0,
        userData: { nodeId },
    });
    api.register(nodeId, body, { motionType: MotionType.KINEMATIC, sensor: false });
    return body;
}

function syncNavigationBody(runtime: NPCRuntime, api: CrashcatApi) {
    const body = runtime.navigationBody;
    if (!body) return;
    rigidBody.setPosition(api.world, body, [
        runtime.data.position.x,
        runtime.data.position.y + NPC_NAVIGATION_CENTER_HEIGHT,
        runtime.data.position.z,
    ], true);
}

function disableNavigationBody(runtime: NPCRuntime, api: CrashcatApi) {
    const body = runtime.navigationBody;
    if (!body) return;
    rigidBody.setPosition(api.world, body, [runtime.data.position.x, -1000, runtime.data.position.z], true);
}

function hasNavigationObstacle(runtime: NPCRuntime, api: CrashcatApi, direction: Vector3) {
    if (!runtime.navigationFilter) return false;
    navigationProbeOrigin[0] = runtime.data.position.x + direction.x * (NPC_NAVIGATION_RADIUS + 0.04);
    navigationProbeOrigin[1] = runtime.data.position.y + NPC_NAVIGATION_CENTER_HEIGHT;
    navigationProbeOrigin[2] = runtime.data.position.z + direction.z * (NPC_NAVIGATION_RADIUS + 0.04);
    navigationProbeDirection[0] = direction.x;
    navigationProbeDirection[1] = 0;
    navigationProbeDirection[2] = direction.z;
    navigationProbeCollector.reset();
    castRay(
        api.world,
        navigationProbeCollector,
        navigationProbeSettings,
        navigationProbeOrigin,
        navigationProbeDirection,
        NPC_OBSTACLE_PROBE_LENGTH,
        runtime.navigationFilter,
    );
    return navigationProbeCollector.hit.status === CastRayStatus.COLLIDING;
}

function syncAnimatedColliders(runtime: NPCRuntime, api: CrashcatApi) {
    // Compute colliders from the complete animated skeleton, then reapply visual damage.
    restoreBoneScales(runtime);
    runtime.root.updateMatrixWorld(true);
    for (const [part, definition] of BODY_PART_ENTRIES) {
        const body = runtime.bodies.get(part);
        const binding = runtime.bindings.get(part);
        if (!body || !binding) continue;
        binding.bone.getWorldPosition(partStart);
        binding.endBone.getWorldPosition(partEnd);
        partDirection.copy(partEnd).sub(partStart).normalize();
        partQuaternion.setFromUnitVectors(
            definition.axis === "x" ? AXIS_X : AXIS_Y,
            partDirection,
        );
        partStart.add(partEnd).multiplyScalar(0.5);
        rigidBody.setPosition(api.world, body, [partStart.x, partStart.y, partStart.z], true);
        rigidBody.setQuaternion(api.world, body, [partQuaternion.x, partQuaternion.y, partQuaternion.z, partQuaternion.w], true);
    }
    applyHitPartScales(runtime);
}

function syncAnimatedCollidersAtFixedRate(runtime: NPCRuntime, api: CrashcatApi, delta: number) {
    runtime.hitboxSyncAccumulator += delta;
    if (runtime.hitboxSyncAccumulator < NPC_HITBOX_SYNC_INTERVAL) return;
    runtime.hitboxSyncAccumulator %= NPC_HITBOX_SYNC_INTERVAL;
    syncAnimatedColliders(runtime, api);
}

function captureBoneOffsets(runtime: NPCRuntime) {
    for (const [part, binding] of runtime.bindings) {
        const body = runtime.bodies.get(part);
        if (!body) continue;
        binding.bone.getWorldPosition(partStart);
        binding.bone.getWorldQuaternion(desiredBoneQuaternion);
        partQuaternion.set(body.quaternion[0], body.quaternion[1], body.quaternion[2], body.quaternion[3]);
        inverseQuaternion.copy(partQuaternion).invert();
        binding.positionOffset.set(
            partStart.x - body.position[0],
            partStart.y - body.position[1],
            partStart.z - body.position[2],
        ).applyQuaternion(inverseQuaternion);
        binding.quaternionOffset.copy(inverseQuaternion).multiply(desiredBoneQuaternion);
    }
}

function createNPCConstraints(runtime: NPCRuntime, api: CrashcatApi) {
    const constraints: SwingTwistConstraint[] = [];
    for (const [part, definition] of BODY_PART_ENTRIES) {
        if (!definition.parent) continue;
        const body = runtime.bodies.get(part);
        const parentBody = runtime.bodies.get(definition.parent);
        const binding = runtime.bindings.get(part);
        if (!body || !parentBody || !binding) continue;

        binding.bone.getWorldPosition(partStart);
        const bodyQuaternion = partQuaternion.set(body.quaternion[0], body.quaternion[1], body.quaternion[2], body.quaternion[3]);
        const childPivot = partStart.clone().sub(new Vector3(body.position[0], body.position[1], body.position[2]))
            .applyQuaternion(inverseQuaternion.copy(bodyQuaternion).invert());
        const parentBodyQuaternion = parentQuaternion.set(parentBody.quaternion[0], parentBody.quaternion[1], parentBody.quaternion[2], parentBody.quaternion[3]);
        const parentPivot = partStart.clone().sub(new Vector3(parentBody.position[0], parentBody.position[1], parentBody.position[2]))
            .applyQuaternion(inverseQuaternion.copy(parentBodyQuaternion).invert());
        const childAxis = definition.axis === "x" ? vec3.fromValues(1, 0, 0) : vec3.fromValues(0, 1, 0);
        const parentAxis = BODY_PARTS[definition.parent].axis === "x"
            ? vec3.fromValues(1, 0, 0)
            : vec3.fromValues(0, 1, 0);
        const swingLimit = part === "head" ? Math.PI / 5
            : part === "torso" ? Math.PI / 6
                : part.includes("Arm") ? Math.PI / 2.8
                    : Math.PI / 4;
        constraints.push(swingTwistConstraint.create(api.world, {
            bodyIdA: body.id,
            bodyIdB: parentBody.id,
            position1: vec3.fromValues(childPivot.x, childPivot.y, childPivot.z),
            position2: vec3.fromValues(parentPivot.x, parentPivot.y, parentPivot.z),
            twistAxis1: childAxis,
            planeAxis1: getTangent(childAxis),
            twistAxis2: parentAxis,
            planeAxis2: getTangent(parentAxis),
            space: ConstraintSpace.LOCAL,
            normalHalfConeAngle: swingLimit,
            planeHalfConeAngle: swingLimit,
            twistMinAngle: -Math.PI / 8,
            twistMaxAngle: Math.PI / 8,
        }));
    }
    return constraints;
}

function clampMotionVector(value: Vec3, maximum: number) {
    const lengthSq = value[0] * value[0] + value[1] * value[1] + value[2] * value[2];
    if (!Number.isFinite(lengthSq)) {
        vec3.set(value, 0, 0, 0);
    } else if (lengthSq > maximum * maximum) {
        vec3.scale(value, value, maximum / Math.sqrt(lengthSq));
    }
}

function stabilizeRagdollMotion(runtime: NPCRuntime) {
    for (const body of runtime.bodies.values()) {
        const motion = body.motionProperties;
        clampMotionVector(motion.linearVelocity, NPC_RAGDOLL_MAX_LINEAR_VELOCITY);
        clampMotionVector(motion.angularVelocity, NPC_RAGDOLL_MAX_ANGULAR_VELOCITY);

        const rotation = body.quaternion;
        const lengthSq = rotation[0] * rotation[0] + rotation[1] * rotation[1]
            + rotation[2] * rotation[2] + rotation[3] * rotation[3];
        if (!Number.isFinite(lengthSq) || lengthSq < 1e-8) {
            quat.identity(rotation);
            vec3.set(motion.linearVelocity, 0, 0, 0);
            vec3.set(motion.angularVelocity, 0, 0, 0);
        } else if (Math.abs(1 - lengthSq) > 1e-5) {
            quat.normalize(rotation, rotation);
        }
    }
}

function activateRagdoll(runtime: NPCRuntime, api: CrashcatApi) {
    if (runtime.data.state === "dead") return;
    captureBoneOffsets(runtime);
    runtime.constraints = createNPCConstraints(runtime, api);
    runtime.model.stop();
    for (const body of runtime.bodies.values()) {
        rigidBody.setMotionType(api.world, body, MotionType.DYNAMIC, true);
        rigidBody.setLinearVelocity(api.world, body, [0, 0, 0]);
        rigidBody.setAngularVelocity(api.world, body, [0, 0, 0]);
    }
    disableNavigationBody(runtime, api);
    runtime.data.state = "dead";
    runtime.data.stateTime = 0;
}

function deactivateRagdoll(runtime: NPCRuntime, api: CrashcatApi) {
    runtime.constraints.forEach(constraint => swingTwistConstraint.remove(api.world, constraint));
    runtime.constraints = [];
    for (const body of runtime.bodies.values()) {
        rigidBody.setMotionType(api.world, body, MotionType.KINEMATIC, true);
        rigidBody.setLinearVelocity(api.world, body, [0, 0, 0]);
        rigidBody.setAngularVelocity(api.world, body, [0, 0, 0]);
    }
}

function syncBonesFromRagdoll(runtime: NPCRuntime) {
    if ([...runtime.bodies.values()].every(body => body.sleeping)) return;
    for (const [part] of BODY_PART_ENTRIES) {
        const body = runtime.bodies.get(part);
        const binding = runtime.bindings.get(part);
        if (!body || !binding || !binding.bone.parent) continue;
        partQuaternion.set(body.quaternion[0], body.quaternion[1], body.quaternion[2], body.quaternion[3]);
        desiredBonePosition.copy(binding.positionOffset).applyQuaternion(partQuaternion)
            .add(bodyPosition.set(body.position[0], body.position[1], body.position[2]));
        desiredBoneQuaternion.copy(partQuaternion).multiply(binding.quaternionOffset);
        binding.bone.parent.updateWorldMatrix(true, false);
        binding.bone.parent.getWorldQuaternion(parentQuaternion);
        binding.bone.position.copy(binding.bone.parent.worldToLocal(desiredBonePosition));
        binding.bone.quaternion.copy(inverseQuaternion.copy(parentQuaternion).invert().multiply(desiredBoneQuaternion));
        binding.bone.updateWorldMatrix(false, true);
    }
}

function NPCDebugColliders({ runtime }: { runtime: NPCRuntime }) {
    const meshesRef = useRef(new Map<NPCBodyPart, Mesh>());
    const navigationMeshRef = useRef<Mesh>(null);
    const navigationProbeMeshRef = useRef<Mesh>(null);

    useFrame(() => {
        const ragdolled = runtime.data.state === "dead";
        for (const [part] of BODY_PART_ENTRIES) {
            const mesh = meshesRef.current.get(part);
            const body = runtime.bodies.get(part);
            if (!mesh || !body) continue;
            mesh.visible = true;
            mesh.position.set(body.position[0], body.position[1], body.position[2]);
            mesh.quaternion.set(body.quaternion[0], body.quaternion[1], body.quaternion[2], body.quaternion[3]);
            const color = ragdolled ? "#ff7a18" : runtime.data.hitParts.has(part) ? "#ff2244" : "#00ff88";
            (mesh.material as MeshBasicMaterial).color.set(color);
        }
        const navigationMesh = navigationMeshRef.current;
        const navigationBody = runtime.navigationBody;
        if (navigationMesh && navigationBody) {
            navigationMesh.visible = runtime.data.state !== "dead";
            navigationMesh.position.set(navigationBody.position[0], navigationBody.position[1], navigationBody.position[2]);
        }
        const navigationProbeMesh = navigationProbeMeshRef.current;
        if (navigationProbeMesh && navigationBody) {
            navigationProbeMesh.visible = navigationMesh?.visible ?? false;
            navigationProbeMesh.position.set(
                navigationBody.position[0] + runtime.navigationDirection.x * (NPC_NAVIGATION_RADIUS + 0.04 + NPC_OBSTACLE_PROBE_LENGTH / 2),
                navigationBody.position[1],
                navigationBody.position[2] + runtime.navigationDirection.z * (NPC_NAVIGATION_RADIUS + 0.04 + NPC_OBSTACLE_PROBE_LENGTH / 2),
            );
            navigationProbeMesh.quaternion.setFromUnitVectors(AXIS_Z, runtime.navigationDirection);
            (navigationProbeMesh.material as MeshBasicMaterial).color.set(runtime.navigationBlocked ? "#ff3344" : "#ffd400");
        }
    });

    return <>
        {BODY_PART_ENTRIES.map(([part, definition]) => (
            <mesh
                key={part}
                ref={(mesh) => {
                    if (mesh) meshesRef.current.set(part, mesh);
                    else meshesRef.current.delete(part);
                }}
                renderOrder={1000}
            >
                <boxGeometry args={definition.halfExtents.map(value => value * runtime.data.scale * 2) as [number, number, number]} />
                <meshBasicMaterial
                    color="#00ff88"
                    depthTest={false}
                    opacity={0.9}
                    transparent
                    wireframe
                />
            </mesh>
        ))}
        <mesh ref={navigationMeshRef} renderOrder={1000}>
            <capsuleGeometry args={[NPC_NAVIGATION_RADIUS, NPC_NAVIGATION_HALF_HEIGHT * 2, 6, 10]} />
            <meshBasicMaterial color="#00bfff" depthTest={false} opacity={0.9} transparent wireframe />
        </mesh>
        <mesh ref={navigationProbeMeshRef} renderOrder={1000}>
            <boxGeometry args={[0.025, 0.025, NPC_OBSTACLE_PROBE_LENGTH]} />
            <meshBasicMaterial color="#ffd400" depthTest={false} />
        </mesh>
    </>;
}

function NPCInstance({
    data,
    register,
}: {
    data: StoredNPC;
    register: (runtime: NPCRuntime | null, id: string) => void;
}) {
    return <LoadedNPCInstance data={data} model={data.model} register={register} />;
}

function LoadedNPCInstance({
    data,
    model,
    register,
}: {
    data: StoredNPC;
    model: AnimatedModelHandle;
    register: (runtime: NPCRuntime | null, id: string) => void;
}) {
    const api = useCrashcat();
    const runtime = useMemo<NPCRuntime>(() => {
        const root = model.object;
        const localPosition = root.position.clone();
        const localQuaternion = root.quaternion.clone();
        const localScale = root.scale.clone();
        const bones = new Map<string, Bone>();
        const boneRestTransforms = new Map<Bone, BoneRestTransform>();
        root.traverse((object) => {
            if (object instanceof Bone) {
                bones.set(object.name, object);
                boneRestTransforms.set(object, {
                    position: object.position.clone(),
                    quaternion: object.quaternion.clone(),
                    scale: object.scale.clone(),
                });
            }
        });
        const bindings = new Map<NPCBodyPart, BoneBinding>();
        BODY_PART_ENTRIES.forEach(([part, definition]) => {
            const bone = bones.get(definition.bone);
            const endBone = bones.get(definition.endBone);
            if (bone && endBone) {
                bindings.set(part, {
                    bone,
                    endBone,
                    positionOffset: new Vector3(),
                    quaternionOffset: new Quaternion(),
                });
            }
        });
        root.updateMatrixWorld(true);
        const nextRuntime: NPCRuntime = {
            data,
            root,
            model,
            localPosition,
            localQuaternion,
            localScale,
            boneRestTransforms,
            bindings,
            bodies: new Map<NPCBodyPart, RigidBody>(),
            navigationBody: null,
            navigationFilter: null,
            navigationDirection: new Vector3(0, 0, 1),
            navigationBlocked: false,
            hitboxSyncAccumulator: 0,
            constraints: [],
        };
        return nextRuntime;
    }, [data, model]);

    // The instance owns physics resources while AnimatedModel owns rendering and animation.
    /* eslint-disable react-hooks/immutability */
    useEffect(() => {
        if (!api) return;
        setObjectWorldPosition(runtime.root, data.position);
        setNPCAnimState(runtime, "idle", true);
        runtime.model.update(0);
        runtime.bodies = createNPCBodies(api, data.id, data.scale);
        runtime.navigationBody = createNPCNavigationBody(api, runtime);
        runtime.navigationFilter = filter.forWorld(api.world);
        filter.copy(runtime.navigationFilter, api.queryFilter);
        const ownNodePrefix = `${data.id}-`;
        runtime.navigationFilter.bodyFilter = body => {
            const nodeId = (body.userData as { nodeId?: unknown } | undefined)?.nodeId;
            return nodeId !== "player" && (typeof nodeId !== "string" || !nodeId.startsWith(ownNodePrefix));
        };
        syncAnimatedColliders(runtime, api);
        syncNavigationBody(runtime, api);
        register(runtime, data.id);
        return () => {
            if (runtime.data.state === "dead") {
                const hips = runtime.bodies.get("hips");
                if (hips) data.position.set(hips.position[0], data.spawnPosition.y, hips.position[2]);
                enterIdle(data);
                data.hp = data.maxHp;
                data.hitParts.clear();
                data.hiddenParts.clear();
            } else {
                runtime.root.getWorldPosition(objectWorldPosition);
                data.position.copy(objectWorldPosition);
            }
            runtime.constraints.forEach(constraint => swingTwistConstraint.remove(api.world, constraint));
            BODY_PART_ENTRIES.forEach(([part]) => api.unregister(`${data.id}-${part}`));
            api.unregister(`${data.id}-navigation`);
            runtime.navigationBody = null;
            runtime.navigationFilter = null;
            register(null, data.id);
            runtime.model.stop();
            runtime.boneRestTransforms.forEach((transform, bone) => {
                bone.position.copy(transform.position);
                bone.quaternion.copy(transform.quaternion);
                bone.scale.copy(transform.scale);
            });
            runtime.model.setAnimationState("idle", true);
            runtime.model.update(0);
            runtime.root.position.copy(runtime.localPosition);
            runtime.root.quaternion.copy(runtime.localQuaternion);
            runtime.root.scale.copy(runtime.localScale);
            runtime.root.updateMatrixWorld(true);
        };
    }, [api, data, register, runtime]);
    /* eslint-enable react-hooks/immutability */

    return (
        <>
            {data.debugRagdoll ? <NPCDebugColliders runtime={runtime} /> : null}
        </>
    );
}

const NPCSystem = forwardRef<NPCManagerRef, NPCSystemProps>(function NPCSystem({ models, settings }, ref) {
    const api = useCrashcat();
    const [npcs] = useState(() => models.map(({ nodeId: id, value: model }) => {
        model.object.updateWorldMatrix(true, false);
        model.object.getWorldPosition(objectWorldPosition);
        return createStoredNPC({
            id,
            position: [objectWorldPosition.x, objectWorldPosition.y, objectWorldPosition.z],
            model,
            scale: settings.scale,
            maxHp: settings.maxHp,
            speed: settings.speed,
            ragdollLifetime: settings.ragdollLifetime,
            debugRagdoll: settings.debugRagdoll,
        });
    }));
    const runtimesRef = useRef(new Map<string, NPCRuntime>());
    const playerPositionRef = useRef(new Vector3());
    const movementRef = useRef(new Vector3());
    const separationRef = useRef(new Vector3());
    const nextPositionRef = useRef(new Vector3());

    const register = useCallback((runtime: NPCRuntime | null, id: string) => {
        if (runtime) runtimesRef.current.set(id, runtime);
        else runtimesRef.current.delete(id);
    }, []);

    useImperativeHandle(ref, () => ({
        raycast: (aimRaycaster, maxDistance) => {
            let closestHit: NPCHit | null = null;
            for (const runtime of runtimesRef.current.values()) {
                if (runtime.data.state === "dead") continue;
                for (const [bodyPart, definition] of BODY_PART_ENTRIES) {
                    if (runtime.data.hiddenParts.has(bodyPart)) continue;
                    const body = runtime.bodies.get(bodyPart);
                    if (!body) continue;
                    const halfExtents = definition.halfExtents;
                    const scale = runtime.data.scale;
                    localBodyBox.min.set(-halfExtents[0] * scale, -halfExtents[1] * scale, -halfExtents[2] * scale);
                    localBodyBox.max.set(halfExtents[0] * scale, halfExtents[1] * scale, halfExtents[2] * scale);
                    partStart.set(body.position[0], body.position[1], body.position[2]);
                    partQuaternion.set(body.quaternion[0], body.quaternion[1], body.quaternion[2], body.quaternion[3]);
                    bodyMatrix.compose(partStart, partQuaternion, unitScale);
                    inverseBodyMatrix.copy(bodyMatrix).invert();
                    localRay.copy(aimRaycaster.ray).applyMatrix4(inverseBodyMatrix);
                    if (!localRay.intersectBox(localBodyBox, localHitPoint)) continue;
                    worldHitPoint.copy(localHitPoint).applyMatrix4(bodyMatrix);
                    const distance = aimRaycaster.ray.origin.distanceTo(worldHitPoint);
                    if (distance > maxDistance) continue;
                    if (closestHit && closestHit.distance <= distance) continue;
                    closestHit = { npcId: runtime.data.id, bodyId: Number(body.id), distance, point: worldHitPoint.clone(), bodyPart };
                }
            }
            return closestHit;
        },
        damage: (hit, amount) => {
            const runtime = runtimesRef.current.get(hit.npcId);
            if (!runtime || !api || runtime.data.state === "dead") return;
            runtime.data.hitParts.add(hit.bodyPart);
            if (hit.bodyPart !== "torso" && hit.bodyPart !== "hips") {
                runtime.data.hiddenParts.add(hit.bodyPart);
                applyHitPartScales(runtime);
            }
            const damage = hit.bodyPart === "head" ? runtime.data.hp : Math.max(0, amount);
            runtime.data.hp = Math.max(0, runtime.data.hp - damage);
            runtime.data.stateTime = 0;
            if (runtime.data.hp <= 0) {
                activateRagdoll(runtime, api);
            } else {
                runtime.data.state = "chase";
                setNPCAnimState(runtime, "run");
            }
        },
    }), [api]);

    useFrame((_, delta) => {
        if (!api) return;
        const playerPosition = getActivePlayer()?.getBody()?.position;
        if (!playerPosition) return;
        playerPositionRef.current.set(playerPosition[0], playerPosition[1], playerPosition[2]);

        for (const runtime of runtimesRef.current.values()) {
            const { data, root, model } = runtime;
            data.stateTime += delta;
            if (data.state === "dead") {
                stabilizeRagdollMotion(runtime);
                syncBonesFromRagdoll(runtime);
                if (data.stateTime >= data.ragdollLifetime) {
                    deactivateRagdoll(runtime, api);
                    resetRuntime(runtime);
                    syncAnimatedColliders(runtime, api);
                    syncNavigationBody(runtime, api);
                }
                continue;
            }

            if (data.state === "idle" && data.stateTime >= data.idleDuration) {
                requestWanderGoal(data, data.position);
            }

            let stopDistance = NPC_STOP_DISTANCE;
            if (data.state === "wander") {
                movementRef.current.copy(data.wanderTarget).sub(data.position);
                movementRef.current.y = 0;
                stopDistance = NPC_WANDER_GOAL_DISTANCE;
                if (movementRef.current.lengthSq() <= stopDistance * stopDistance || data.stateTime >= NPC_WANDER_TIMEOUT) {
                    enterIdle(data);
                }
            } else if (data.state === "chase") {
                movementRef.current.copy(playerPositionRef.current).sub(data.position);
                movementRef.current.y = 0;
            }

            const distance = movementRef.current.length();
            runtime.navigationBlocked = false;
            const shouldMove = data.state !== "idle" && distance > stopDistance;
            setNPCAnimState(runtime, data.state === "idle" ? "idle" : data.state === "chase" ? "run" : "walk");
            if (shouldMove) {
                movementRef.current.normalize();
                runtime.navigationDirection.copy(movementRef.current);

                runtime.navigationBlocked = hasNavigationObstacle(runtime, api, movementRef.current);
                if (runtime.navigationBlocked) {
                    movementRef.current.applyAxisAngle(
                        AXIS_Y,
                        data.avoidanceSign * NPC_OBSTACLE_TURN_ANGLE,
                    );
                }

                for (const other of runtimesRef.current.values()) {
                    if (other === runtime || other.data.state === "dead") continue;
                    separationRef.current.copy(data.position).sub(other.data.position);
                    separationRef.current.y = 0;
                    const separationDistance = separationRef.current.length();
                    if (separationDistance <= 1e-4 || separationDistance >= NPC_NAVIGATION_SPACING * 1.5) continue;
                    movementRef.current.addScaledVector(
                        separationRef.current.multiplyScalar(1 / separationDistance),
                        (1 - separationDistance / (NPC_NAVIGATION_SPACING * 1.5)) * 1.4,
                    );
                }
                movementRef.current.normalize();

                const targetRotation = Math.atan2(movementRef.current.x, movementRef.current.z);
                root.rotation.y = dampAngle(root.rotation.y, targetRotation, NPC_TURN_RESPONSE, delta);
                movementRef.current.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
                runtime.navigationDirection.copy(movementRef.current);

                nextPositionRef.current.copy(data.position).addScaledVector(movementRef.current, data.speed * delta);
                for (const other of runtimesRef.current.values()) {
                    if (other === runtime || other.data.state === "dead") continue;
                    separationRef.current.copy(nextPositionRef.current).sub(other.data.position);
                    separationRef.current.y = 0;
                    const separationDistance = separationRef.current.length();
                    if (separationDistance >= NPC_NAVIGATION_SPACING) continue;
                    if (separationDistance <= 1e-4) {
                        separationRef.current.set(data.avoidanceSign, 0, 0);
                    } else {
                        separationRef.current.multiplyScalar(1 / separationDistance);
                    }
                    nextPositionRef.current.addScaledVector(
                        separationRef.current,
                        NPC_NAVIGATION_SPACING - separationDistance,
                    );
                }
                data.position.copy(nextPositionRef.current);
                setObjectWorldPosition(root, data.position);
            }
            model.update(delta);
            syncAnimatedCollidersAtFixedRate(runtime, api, delta);
            syncNavigationBody(runtime, api);
        }
    });

    return <>{npcs.map(data => <NPCInstance key={data.id} data={data} register={register} />)}</>;
});

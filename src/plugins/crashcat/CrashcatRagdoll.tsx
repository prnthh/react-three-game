"use client";

import { createPortal, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import type { Mat3, Vec3 } from "mathcat";
import { mat3, mat4, quat, vec3 } from "mathcat";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
    box,
    ConstraintSpace,
    massProperties,
    motionProperties,
    MotionType,
    rigidBody,
    swingTwistConstraint,
    type RigidBody,
    type SwingTwistConstraint,
    type World,
} from "crashcat";
import { Mesh, Quaternion, Vector3 } from "three";
import {
    BooleanField,
    FieldRenderer,
    StringField,
    Vector3Field,
    type FieldDefinition,
} from "../../tools/prefabeditor/components/Input";
import type {
    Component,
    ComponentViewProps,
    NodeInteractionHandlers,
} from "../../tools/prefabeditor/components/ComponentRegistry";
import { useCrashcat, type CrashcatApi } from "./CrashcatRuntime";

export enum RagdollBodyPart {
    UpperBody = 0,
    Head = 1,
    UpperLeftArm = 2,
    LowerLeftArm = 3,
    UpperRightArm = 4,
    LowerRightArm = 5,
    Pelvis = 6,
    UpperLeftLeg = 7,
    LowerLeftLeg = 8,
    UpperRightLeg = 9,
    LowerRightLeg = 10,
}

type ShapeConfig = {
    args: Vec3;
    density: number;
    position: Vec3;
};

type JointConfig = {
    bodyA: RagdollBodyPart;
    bodyB: RagdollBodyPart;
    pivotA: Vec3;
    pivotB: Vec3;
    axisA: Vec3;
    axisB: Vec3;
    angle: number;
    twistAngle: number;
};

type SkeletonJoint = {
    bodyPart: RagdollBodyPart;
    parentBodyPart: RagdollBodyPart | null;
};

export type RagdollSettings = {
    shapes: Map<RagdollBodyPart, ShapeConfig>;
    joints: JointConfig[];
    skeleton: SkeletonJoint[];
};

export type CrashcatRagdollProps = {
    position?: [number, number, number];
    scale?: number;
    swingAngle?: number;
    shoulderAngle?: number;
    twistAngle?: number;
    stabilize?: boolean;
    initialLinearVelocity?: [number, number, number];
    initialAngularVelocity?: [number, number, number];
    color?: string;
    clickImpulse?: number;
    nodeInteractionHandlers?: NodeInteractionHandlers;
};

type CrashcatRagdollComponentProperties = {
    scale?: number;
    swingAngle?: number;
    shoulderAngle?: number;
    twistAngle?: number;
    stabilize?: boolean;
    color?: string;
    clickImpulse?: number;
    initialLinearVelocity?: [number, number, number];
    initialAngularVelocity?: [number, number, number];
};

let nextRagdollId = 0;
const DEFAULT_POSITION: [number, number, number] = [0, 0, 0];
const ZERO_VECTOR: [number, number, number] = [0, 0, 0];

export function createRagdollSettings(
    scale = 1,
    angleA = Math.PI / 4,
    angleB = Math.PI / 4,
    twistAngle = 0,
): RagdollSettings {
    const shouldersDistance = 0.45 * scale;
    const upperArmLength = 0.4 * scale;
    const lowerArmLength = 0.4 * scale;
    const upperArmSize = 0.15 * scale;
    const lowerArmSize = 0.15 * scale;
    const neckLength = 0.1 * scale;
    const headRadius = 0.2 * scale;
    const upperBodyLength = 0.6 * scale;
    const pelvisLength = 0.2 * scale;
    const pelvisSize = 0.25 * scale;
    const upperLegLength = 0.5 * scale;
    const upperLegSize = 0.15 * scale;
    const lowerLegSize = 0.15 * scale;
    const lowerLegLength = 0.5 * scale;

    const lowerLeftLegPos: Vec3 = [-shouldersDistance / 3, lowerLegLength / 2, 0];
    const lowerRightLegPos: Vec3 = [shouldersDistance / 3, lowerLegLength / 2, 0];
    const upperLeftLegPos: Vec3 = [-shouldersDistance / 3, lowerLeftLegPos[1] + lowerLegLength / 2 + upperLegLength / 2, 0];
    const upperRightLegPos: Vec3 = [shouldersDistance / 3, lowerRightLegPos[1] + lowerLegLength / 2 + upperLegLength / 2, 0];
    const pelvisPos: Vec3 = [0, upperLeftLegPos[1] + upperLegLength / 2 + pelvisLength / 2, 0];
    const upperBodyPos: Vec3 = [0, pelvisPos[1] + pelvisLength / 2 + upperBodyLength / 2, 0];
    const headPos: Vec3 = [0, upperBodyPos[1] + upperBodyLength / 2 + headRadius / 2 + neckLength, 0];
    const upperLeftArmPos: Vec3 = [-shouldersDistance / 2 - upperArmLength / 2, upperBodyPos[1] + upperBodyLength / 2, 0];
    const upperRightArmPos: Vec3 = [shouldersDistance / 2 + upperArmLength / 2, upperBodyPos[1] + upperBodyLength / 2, 0];
    const lowerLeftArmPos: Vec3 = [upperLeftArmPos[0] - lowerArmLength / 2 - upperArmLength / 2, upperLeftArmPos[1], 0];
    const lowerRightArmPos: Vec3 = [upperRightArmPos[0] + lowerArmLength / 2 + upperArmLength / 2, upperRightArmPos[1], 0];

    const shapes = new Map<RagdollBodyPart, ShapeConfig>([
        [RagdollBodyPart.LowerLeftLeg, { args: [lowerLegSize * 0.5, lowerLegLength * 0.5, lowerLegSize * 0.5], density: scale, position: lowerLeftLegPos }],
        [RagdollBodyPart.LowerRightLeg, { args: [lowerLegSize * 0.5, lowerLegLength * 0.5, lowerLegSize * 0.5], density: scale, position: lowerRightLegPos }],
        [RagdollBodyPart.UpperLeftLeg, { args: [upperLegSize * 0.5, upperLegLength * 0.5, upperLegSize * 0.5], density: scale, position: upperLeftLegPos }],
        [RagdollBodyPart.UpperRightLeg, { args: [upperLegSize * 0.5, upperLegLength * 0.5, upperLegSize * 0.5], density: scale, position: upperRightLegPos }],
        [RagdollBodyPart.Pelvis, { args: [shouldersDistance * 0.5, pelvisLength * 0.5, pelvisSize * 0.5], density: scale, position: pelvisPos }],
        [RagdollBodyPart.UpperBody, { args: [shouldersDistance * 0.5, upperBodyLength * 0.5, lowerArmSize * 0.75], density: scale, position: upperBodyPos }],
        [RagdollBodyPart.Head, { args: [headRadius * 0.6, headRadius * 0.7, headRadius * 0.6], density: scale, position: headPos }],
        [RagdollBodyPart.UpperLeftArm, { args: [upperArmLength * 0.5, upperArmSize * 0.5, upperArmSize * 0.5], density: scale, position: upperLeftArmPos }],
        [RagdollBodyPart.UpperRightArm, { args: [upperArmLength * 0.5, upperArmSize * 0.5, upperArmSize * 0.5], density: scale, position: upperRightArmPos }],
        [RagdollBodyPart.LowerLeftArm, { args: [lowerArmLength * 0.5, lowerArmSize * 0.5, lowerArmSize * 0.5], density: scale, position: lowerLeftArmPos }],
        [RagdollBodyPart.LowerRightArm, { args: [lowerArmLength * 0.5, lowerArmSize * 0.5, lowerArmSize * 0.5], density: scale, position: lowerRightArmPos }],
    ]);

    const joints: JointConfig[] = [
        { bodyA: RagdollBodyPart.Head, bodyB: RagdollBodyPart.UpperBody, pivotA: [0, -headRadius - neckLength / 2, 0], pivotB: [0, upperBodyLength / 2, 0], axisA: [0, 1, 0], axisB: [0, 1, 0], angle: angleA, twistAngle },
        { bodyA: RagdollBodyPart.LowerLeftLeg, bodyB: RagdollBodyPart.UpperLeftLeg, pivotA: [0, lowerLegLength / 2, 0], pivotB: [0, -upperLegLength / 2, 0], axisA: [0, 1, 0], axisB: [0, 1, 0], angle: angleA, twistAngle },
        { bodyA: RagdollBodyPart.LowerRightLeg, bodyB: RagdollBodyPart.UpperRightLeg, pivotA: [0, lowerLegLength / 2, 0], pivotB: [0, -upperLegLength / 2, 0], axisA: [0, 1, 0], axisB: [0, 1, 0], angle: angleA, twistAngle },
        { bodyA: RagdollBodyPart.UpperLeftLeg, bodyB: RagdollBodyPart.Pelvis, pivotA: [0, upperLegLength / 2, 0], pivotB: [-shouldersDistance / 3, -pelvisLength / 2, 0], axisA: [0, 1, 0], axisB: [0, 1, 0], angle: angleA, twistAngle },
        { bodyA: RagdollBodyPart.UpperRightLeg, bodyB: RagdollBodyPart.Pelvis, pivotA: [0, upperLegLength / 2, 0], pivotB: [shouldersDistance / 3, -pelvisLength / 2, 0], axisA: [0, 1, 0], axisB: [0, 1, 0], angle: angleA, twistAngle },
        { bodyA: RagdollBodyPart.Pelvis, bodyB: RagdollBodyPart.UpperBody, pivotA: [0, pelvisLength / 2, 0], pivotB: [0, -upperBodyLength / 2, 0], axisA: [0, 1, 0], axisB: [0, 1, 0], angle: angleA, twistAngle },
        { bodyA: RagdollBodyPart.UpperBody, bodyB: RagdollBodyPart.UpperLeftArm, pivotA: [-shouldersDistance / 2, upperBodyLength / 2, 0], pivotB: [upperArmLength / 2, 0, 0], axisA: [1, 0, 0], axisB: [1, 0, 0], angle: angleB, twistAngle },
        { bodyA: RagdollBodyPart.UpperBody, bodyB: RagdollBodyPart.UpperRightArm, pivotA: [shouldersDistance / 2, upperBodyLength / 2, 0], pivotB: [-upperArmLength / 2, 0, 0], axisA: [1, 0, 0], axisB: [1, 0, 0], angle: angleB, twistAngle },
        { bodyA: RagdollBodyPart.LowerLeftArm, bodyB: RagdollBodyPart.UpperLeftArm, pivotA: [lowerArmLength / 2, 0, 0], pivotB: [-upperArmLength / 2, 0, 0], axisA: [1, 0, 0], axisB: [1, 0, 0], angle: angleA, twistAngle },
        { bodyA: RagdollBodyPart.LowerRightArm, bodyB: RagdollBodyPart.UpperRightArm, pivotA: [-lowerArmLength / 2, 0, 0], pivotB: [upperArmLength / 2, 0, 0], axisA: [1, 0, 0], axisB: [1, 0, 0], angle: angleA, twistAngle },
    ];

    const skeleton: SkeletonJoint[] = [
        { bodyPart: RagdollBodyPart.Pelvis, parentBodyPart: null },
        { bodyPart: RagdollBodyPart.UpperBody, parentBodyPart: RagdollBodyPart.Pelvis },
        { bodyPart: RagdollBodyPart.Head, parentBodyPart: RagdollBodyPart.UpperBody },
        { bodyPart: RagdollBodyPart.UpperLeftArm, parentBodyPart: RagdollBodyPart.UpperBody },
        { bodyPart: RagdollBodyPart.LowerLeftArm, parentBodyPart: RagdollBodyPart.UpperLeftArm },
        { bodyPart: RagdollBodyPart.UpperRightArm, parentBodyPart: RagdollBodyPart.UpperBody },
        { bodyPart: RagdollBodyPart.LowerRightArm, parentBodyPart: RagdollBodyPart.UpperRightArm },
        { bodyPart: RagdollBodyPart.UpperLeftLeg, parentBodyPart: RagdollBodyPart.Pelvis },
        { bodyPart: RagdollBodyPart.LowerLeftLeg, parentBodyPart: RagdollBodyPart.UpperLeftLeg },
        { bodyPart: RagdollBodyPart.UpperRightLeg, parentBodyPart: RagdollBodyPart.Pelvis },
        { bodyPart: RagdollBodyPart.LowerRightLeg, parentBodyPart: RagdollBodyPart.UpperRightLeg },
    ];

    return { shapes, joints, skeleton };
}

function getTangent(out: Vec3, axis: Vec3): Vec3 {
    const ax = Math.abs(axis[0]);
    const ay = Math.abs(axis[1]);
    const az = Math.abs(axis[2]);

    if (ax <= ay && ax <= az) {
        vec3.set(out, 0, -axis[2], axis[1]);
    } else if (ay <= az) {
        vec3.set(out, axis[2], 0, -axis[0]);
    } else {
        vec3.set(out, -axis[1], axis[0], 0);
    }
    vec3.normalize(out, out);
    return out;
}

function createRagdollBodies(
    api: CrashcatApi,
    instanceId: string,
    settings: RagdollSettings,
    offset: Vec3,
    stabilize: boolean,
) {
    const bodies = new Map<RagdollBodyPart, RigidBody>();
    const constraints: SwingTwistConstraint[] = [];
    const nodeIds: string[] = [];

    for (const [part, config] of settings.shapes) {
        const body = rigidBody.create(api.world, {
            shape: box.create({
                halfExtents: vec3.fromValues(config.args[0], config.args[1], config.args[2]),
                convexRadius: Math.min(0.05, Math.min(config.args[0], config.args[1], config.args[2]) * 0.45),
                density: config.density,
            }),
            objectLayer: api.movingObjectLayer,
            motionType: MotionType.DYNAMIC,
            position: vec3.fromValues(
                config.position[0] + offset[0],
                config.position[1] + offset[1],
                config.position[2] + offset[2],
            ),
            quaternion: quat.create(),
            linearDamping: 0.05,
            angularDamping: 0.05,
            restitution: 0,
            userData: { nodeId: `${instanceId}-${part}` },
        });
        const nodeId = `${instanceId}-${part}`;
        api.register(nodeId, body, { motionType: MotionType.DYNAMIC, sensor: false });
        bodies.set(part, body);
        nodeIds.push(nodeId);
    }

    if (stabilize) {
        stabilizeRagdoll(bodies, settings.skeleton);
    }

    for (const joint of settings.joints) {
        const bodyA = bodies.get(joint.bodyA);
        const bodyB = bodies.get(joint.bodyB);
        if (!bodyA || !bodyB) continue;

        constraints.push(swingTwistConstraint.create(api.world, {
            bodyIdA: bodyA.id,
            bodyIdB: bodyB.id,
            position1: vec3.fromValues(joint.pivotA[0], joint.pivotA[1], joint.pivotA[2]),
            position2: vec3.fromValues(joint.pivotB[0], joint.pivotB[1], joint.pivotB[2]),
            twistAxis1: vec3.fromValues(joint.axisA[0], joint.axisA[1], joint.axisA[2]),
            planeAxis1: getTangent(vec3.create(), joint.axisA),
            twistAxis2: vec3.fromValues(joint.axisB[0], joint.axisB[1], joint.axisB[2]),
            planeAxis2: getTangent(vec3.create(), joint.axisB),
            space: ConstraintSpace.LOCAL,
            normalHalfConeAngle: joint.angle,
            planeHalfConeAngle: joint.angle,
            twistMinAngle: -joint.twistAngle,
            twistMaxAngle: joint.twistAngle,
        }));
    }

    return { bodies, constraints, nodeIds };
}

function stabilizeRagdoll(bodies: Map<RagdollBodyPart, RigidBody>, skeleton: SkeletonJoint[]): void {
    const minMassRatio = 0.8;
    const maxMassRatio = 1.2;
    const maxInertiaIncrease = 2;
    const visited = new Set<RagdollBodyPart>();
    const massRatios = new Map<RagdollBodyPart, number>();
    const roots = skeleton.filter((joint) => joint.parentBodyPart === null);

    for (const root of roots) {
        const chain: RagdollBodyPart[] = [];
        const toProcess: RagdollBodyPart[] = [root.bodyPart];

        while (toProcess.length > 0) {
            const current = toProcess.shift();
            if (current === undefined || visited.has(current)) continue;
            visited.add(current);
            chain.push(current);

            for (const joint of skeleton) {
                if (joint.parentBodyPart === current && !visited.has(joint.bodyPart)) {
                    toProcess.push(joint.bodyPart);
                }
            }
        }

        if (chain.length <= 1) continue;

        let totalMassRatio = 1;
        massRatios.set(chain[0], 1);

        for (let i = 1; i < chain.length; i += 1) {
            const childPart = chain[i];
            const parentPart = skeleton.find((joint) => joint.bodyPart === childPart)?.parentBodyPart;
            if (parentPart === undefined || parentPart === null) continue;

            const childBody = bodies.get(childPart);
            const parentBody = bodies.get(parentPart);
            if (!childBody || !parentBody) continue;

            const ratio = childBody.massProperties.mass / parentBody.massProperties.mass;
            const clampedRatio = Math.max(minMassRatio, Math.min(maxMassRatio, ratio));
            const parentRatio = massRatios.get(parentPart) ?? 1;
            const childRatio = parentRatio * clampedRatio;
            massRatios.set(childPart, childRatio);
            totalMassRatio += childRatio;
        }

        let totalMass = 0;
        for (const part of chain) {
            totalMass += bodies.get(part)?.massProperties.mass ?? 0;
        }

        const ratioToMass = totalMass / totalMassRatio;
        for (const part of chain) {
            const body = bodies.get(part);
            const ratio = massRatios.get(part);
            if (!body || ratio === undefined) continue;

            const oldMass = body.massProperties.mass;
            const newMass = ratio * ratioToMass;
            body.massProperties.mass = newMass;

            const massScale = oldMass > 0 ? newMass / oldMass : 1;
            for (let i = 0; i < 15; i += 1) {
                body.massProperties.inertia[i] *= massScale;
            }
            body.massProperties.inertia[15] = 1;
        }

        type Principal = {
            rotation: Mat3;
            diagonal: Vec3;
            childSum: number;
        };

        const principals = new Map<RagdollBodyPart, Principal>();
        for (const part of chain) {
            const body = bodies.get(part);
            if (!body) continue;
            const rotation = mat3.create();
            const diagonal = vec3.create();
            if (motionProperties.decomposePrincipalMomentsOfInertia(body.massProperties.inertia, rotation, diagonal)) {
                principals.set(part, { rotation, diagonal, childSum: 0 });
            }
        }

        for (let i = chain.length - 1; i > 0; i -= 1) {
            const childPart = chain[i];
            const parentPart = skeleton.find((joint) => joint.bodyPart === childPart)?.parentBodyPart;
            if (parentPart === undefined || parentPart === null) continue;

            const childPrincipal = principals.get(childPart);
            const parentPrincipal = principals.get(parentPart);
            if (childPrincipal && parentPrincipal) {
                parentPrincipal.childSum += childPrincipal.diagonal[0] + childPrincipal.childSum;
            }
        }

        for (const part of chain) {
            const principal = principals.get(part);
            const body = bodies.get(part);
            if (!principal || !body || principal.childSum === 0) continue;

            const minimum = Math.min(maxInertiaIncrease * principal.diagonal[0], principal.childSum);
            principal.diagonal[0] = Math.max(principal.diagonal[0], minimum);
            principal.diagonal[1] = Math.max(principal.diagonal[1], minimum);
            principal.diagonal[2] = Math.max(principal.diagonal[2], minimum);

            const scale = mat4.create();
            mat4.fromScaling(scale, principal.diagonal);

            const rot4x4 = mat4.create();
            mat4.identity(rot4x4);
            for (let i = 0; i < 3; i += 1) {
                for (let j = 0; j < 3; j += 1) {
                    rot4x4[i + j * 4] = principal.rotation[i + j * 3];
                }
            }

            const temp1 = mat4.create();
            const temp2 = mat4.create();
            mat4.multiply(temp1, rot4x4, scale);
            mat4.transpose(temp2, rot4x4);
            mat4.multiply(body.massProperties.inertia, temp1, temp2);
            body.massProperties.inertia[15] = 1;
        }
    }

    for (const body of bodies.values()) {
        if (body.motionType !== MotionType.DYNAMIC) continue;
        const mp = massProperties.create();
        massProperties.copy(mp, body.massProperties);
        body.massPropertiesOverride = rigidBody.MassPropertiesOverride.MASS_AND_INERTIA_PROVIDED;
        body.motionProperties.invMass = mp.mass > 0 ? 1 / mp.mass : 0;

        const rotation = mat3.create();
        const diagonal = vec3.create();
        if (motionProperties.decomposePrincipalMomentsOfInertia(mp.inertia, rotation, diagonal)) {
            vec3.set(
                body.motionProperties.invInertiaDiagonal,
                diagonal[0] !== 0 ? 1 / diagonal[0] : 0,
                diagonal[1] !== 0 ? 1 / diagonal[1] : 0,
                diagonal[2] !== 0 ? 1 / diagonal[2] : 0,
            );
            quat.fromMat3(body.motionProperties.inertiaRotation, rotation);
        }
    }
}

const meshPosition = new Vector3();
const meshQuaternion = new Quaternion();

const ragdollFields: FieldDefinition[] = [
    { name: "scale", type: "number", label: "Scale", step: 0.1 },
    { name: "swingAngle", type: "number", label: "Swing Angle", step: 0.05 },
    { name: "shoulderAngle", type: "number", label: "Shoulder Angle", step: 0.05 },
    { name: "twistAngle", type: "number", label: "Twist Angle", step: 0.05 },
    { name: "clickImpulse", type: "number", label: "Click Impulse", min: 0, step: 0.5 },
];

export function CrashcatRagdoll({
    position = DEFAULT_POSITION,
    scale = 1.8,
    swingAngle = Math.PI / 4,
    shoulderAngle = Math.PI / 4,
    twistAngle = 0,
    stabilize = true,
    initialLinearVelocity = ZERO_VECTOR,
    initialAngularVelocity = ZERO_VECTOR,
    color = "#f97316",
    clickImpulse = 8,
    nodeInteractionHandlers,
}: CrashcatRagdollProps) {
    const api = useCrashcat();
    const instanceId = useRef(`crashcat-ragdoll-${nextRagdollId++}`);
    const stateRef = useRef<ReturnType<typeof createRagdollBodies> | null>(null);
    const meshRefs = useRef(new Map<RagdollBodyPart, Mesh>());
    const settings = useMemo(
        () => createRagdollSettings(scale, swingAngle, shoulderAngle, twistAngle),
        [scale, shoulderAngle, swingAngle, twistAngle],
    );
    const shapeEntries = useMemo(() => [...settings.shapes], [settings]);
    const [px, py, pz] = position;
    const [lvx, lvy, lvz] = initialLinearVelocity;
    const [avx, avy, avz] = initialAngularVelocity;

    useEffect(() => {
        if (!api) return undefined;

        const state = createRagdollBodies(api, instanceId.current, settings, [px, py, pz], stabilize);
        stateRef.current = state;

        for (const body of state.bodies.values()) {
            rigidBody.addLinearVelocity(api.world, body, [lvx, lvy, lvz]);
            rigidBody.addAngularVelocity(api.world, body, [avx, avy, avz]);
        }

        return () => {
            for (const constraint of state.constraints) {
                swingTwistConstraint.remove(api.world, constraint);
            }
            for (const nodeId of state.nodeIds) {
                api.unregister(nodeId);
            }
            stateRef.current = null;
        };
    }, [api, avx, avy, avz, lvx, lvy, lvz, px, py, pz, settings, stabilize]);

    useFrame(() => {
        const state = stateRef.current;
        if (!state) return;

        for (const [part, body] of state.bodies) {
            const mesh = meshRefs.current.get(part);
            if (!mesh) continue;
            meshPosition.set(body.position[0], body.position[1], body.position[2]);
            meshQuaternion.set(body.quaternion[0], body.quaternion[1], body.quaternion[2], body.quaternion[3]);
            mesh.position.copy(meshPosition);
            mesh.quaternion.copy(meshQuaternion);
        }
    });

    const handleClick = useCallback((event: ThreeEvent<PointerEvent>) => {
        nodeInteractionHandlers?.onClick?.(event);
        const apiWorld = api?.world;
        const state = stateRef.current;
        if (!apiWorld || !state || clickImpulse <= 0) return;

        let hitBody: RigidBody | null = null;
        let minDistanceSq = Infinity;
        for (const body of state.bodies.values()) {
            const dx = body.position[0] - event.point.x;
            const dy = body.position[1] - event.point.y;
            const dz = body.position[2] - event.point.z;
            const distanceSq = dx * dx + dy * dy + dz * dz;
            if (distanceSq < minDistanceSq) {
                minDistanceSq = distanceSq;
                hitBody = body;
            }
        }

        if (!hitBody) return;

        rigidBody.addImpulseAtPosition(
            apiWorld,
            hitBody,
            [
                event.ray.direction.x * clickImpulse,
                event.ray.direction.y * clickImpulse + clickImpulse * 0.35,
                event.ray.direction.z * clickImpulse,
            ],
            [event.point.x, event.point.y, event.point.z],
        );
    }, [api, clickImpulse, nodeInteractionHandlers]);

    const interactionHandlers = {
        ...nodeInteractionHandlers,
        onClick: handleClick,
    };

    return (
        <group {...interactionHandlers}>
            {shapeEntries.map(([part, config]) => (
                <mesh
                    key={part}
                    ref={(mesh) => {
                        if (mesh) meshRefs.current.set(part, mesh);
                        else meshRefs.current.delete(part);
                    }}
                    castShadow
                    receiveShadow
                    position={[
                        config.position[0] + px,
                        config.position[1] + py,
                        config.position[2] + pz,
                    ]}
                >
                    <boxGeometry args={[config.args[0] * 2, config.args[1] * 2, config.args[2] * 2]} />
                    <meshStandardMaterial color={color} roughness={0.72} metalness={0.05} />
                </mesh>
            ))}
        </group>
    );
}

function CrashcatRagdollEditor({
    component,
    onUpdate,
}: {
    component: { properties: CrashcatRagdollComponentProperties };
    onUpdate: (values: CrashcatRagdollComponentProperties) => void;
}) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <FieldRenderer fields={ragdollFields} values={component.properties} onChange={onUpdate} />
            <BooleanField name="stabilize" label="Stabilize" values={component.properties} onChange={onUpdate} fallback />
            <StringField name="color" label="Color" values={component.properties} onChange={onUpdate} fallback="#f97316" />
            <Vector3Field name="initialLinearVelocity" label="Initial Linear Velocity" values={component.properties} onChange={onUpdate} fallback={[0, 0, 0]} />
            <Vector3Field name="initialAngularVelocity" label="Initial Angular Velocity" values={component.properties} onChange={onUpdate} fallback={[0, 0, 0]} />
        </div>
    );
}

function CrashcatRagdollView({
    properties,
    children,
    editMode,
    nodeInteractionHandlers,
    worldPosition,
}: ComponentViewProps<CrashcatRagdollComponentProperties>) {
    const scene = useThree((state) => state.scene);

    return (
        <>
            {children}
            {worldPosition
                ? createPortal(
                    <CrashcatRagdoll
                        position={worldPosition}
                        scale={properties.scale ?? 1.8}
                        swingAngle={properties.swingAngle ?? Math.PI / 4}
                        shoulderAngle={properties.shoulderAngle ?? Math.PI / 4}
                        twistAngle={properties.twistAngle ?? 0}
                        stabilize={properties.stabilize !== false}
                        color={properties.color ?? "#f97316"}
                        clickImpulse={editMode ? 0 : properties.clickImpulse ?? 8}
                        initialLinearVelocity={properties.initialLinearVelocity}
                        initialAngularVelocity={properties.initialAngularVelocity}
                        nodeInteractionHandlers={nodeInteractionHandlers}
                    />,
                    scene,
                )
                : null}
        </>
    );
}

const CrashcatRagdollComponent: Component = {
    name: "CrashcatRagdoll",
    Editor: CrashcatRagdollEditor,
    View: CrashcatRagdollView,
    defaultProperties: {
        scale: 1.8,
        swingAngle: Math.PI / 4,
        shoulderAngle: Math.PI / 4,
        twistAngle: 0,
        stabilize: true,
        color: "#f97316",
        clickImpulse: 8,
        initialLinearVelocity: [0, 0, 0],
        initialAngularVelocity: [0, 0, 0],
    },
};

export default CrashcatRagdollComponent;

export function createStaticBoxBody(
    world: World,
    objectLayer: number,
    halfExtents: Vec3,
    position: Vec3,
) {
    return rigidBody.create(world, {
        shape: box.create({ halfExtents }),
        objectLayer,
        motionType: MotionType.STATIC,
        position,
    });
}

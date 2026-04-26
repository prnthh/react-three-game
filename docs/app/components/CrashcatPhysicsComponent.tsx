"use client";

import { useEffect } from "react";
import {
    box,
    capsule,
    convexHull,
    MotionQuality,
    MotionType,
    rigidBody,
    sphere,
    triangleMesh,
} from "crashcat";
import {
    BooleanField,
    FieldRenderer,
    StringField,
    Vector3Field,
    useNode,
} from "react-three-game";
import type { Component, ComponentViewProps, FieldDefinition } from "react-three-game";
import { Box3, Matrix4, Quaternion, Vector3 } from "three";
import type { Object3D } from "three";
import { useCrashcat } from "./CrashcatRuntime";

type CrashcatPhysicsProperties = {
    type?: "fixed" | "dynamic" | "kinematic";
    colliders?: "autoBox" | "ball" | "capsule" | "hull" | "trimesh";
    motionQuality?: "discrete" | "linearCast";
    sensor?: boolean;
    friction?: number;
    restitution?: number;
    radius?: number;
    capsuleHalfHeight?: number;
    linearVelocity?: [number, number, number];
    collisionEnter?: string;
    collisionExit?: string;
    sensorEnter?: string;
    sensorExit?: string;
};

const inverseWorldMatrix = new Matrix4();
const childToLocalMatrix = new Matrix4();
const localBounds = new Box3();
const childBounds = new Box3();
const boundsSize = new Vector3();
const boundsCenter = new Vector3();
const scratchScale = new Vector3();
const scratchVertex = new Vector3();
const tmpQuat = new Quaternion();

function getLocalBounds(object: Object3D) {
    inverseWorldMatrix.copy(object.matrixWorld).invert();
    localBounds.makeEmpty();
    object.traverse((child) => {
        const geometry = (child as Object3D & { geometry?: { boundingBox?: Box3 | null; computeBoundingBox?: () => void } }).geometry;
        if (!geometry) return;
        if (!geometry.boundingBox) geometry.computeBoundingBox?.();
        if (!geometry.boundingBox) return;
        childToLocalMatrix.multiplyMatrices(inverseWorldMatrix, child.matrixWorld);
        childBounds.copy(geometry.boundingBox).applyMatrix4(childToLocalMatrix);
        localBounds.union(childBounds);
    });
    return localBounds.isEmpty() ? null : localBounds;
}

function collectGeometryData(object: Object3D) {
    const positions: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;
    inverseWorldMatrix.copy(object.matrixWorld).invert();
    object.traverse((child) => {
        const geometry = (child as Object3D & {
            geometry?: {
                attributes?: { position?: { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number } };
                index?: { count: number; getX: (i: number) => number } | null;
            };
        }).geometry;
        const positionAttribute = geometry?.attributes?.position;
        if (!positionAttribute) return;
        childToLocalMatrix.multiplyMatrices(inverseWorldMatrix, child.matrixWorld);
        for (let i = 0; i < positionAttribute.count; i += 1) {
            scratchVertex
                .set(positionAttribute.getX(i), positionAttribute.getY(i), positionAttribute.getZ(i))
                .applyMatrix4(childToLocalMatrix);
            positions.push(scratchVertex.x, scratchVertex.y, scratchVertex.z);
        }
        if (geometry.index) {
            for (let i = 0; i < geometry.index.count; i += 1) indices.push(vertexOffset + geometry.index.getX(i));
        } else {
            for (let i = 0; i < positionAttribute.count; i += 1) indices.push(vertexOffset + i);
        }
        vertexOffset += positionAttribute.count;
    });
    if (positions.length === 0 || indices.length < 3) return null;
    return { positions, indices };
}

function createShape(object: Object3D, bounds: Box3, colliders: CrashcatPhysicsProperties["colliders"], radius?: number, capsuleHalfHeight?: number) {
    if (colliders === "trimesh") {
        const geo = collectGeometryData(object);
        return geo ? triangleMesh.create(geo) : null;
    }
    if (colliders === "hull") {
        const geo = collectGeometryData(object);
        return geo ? convexHull.create({ positions: geo.positions }) : null;
    }
    if (colliders === "capsule") {
        return capsule.create({
            radius: Math.max(radius ?? 0.35, 0.01),
            halfHeightOfCylinder: Math.max(capsuleHalfHeight ?? 0.45, 0.01),
        });
    }
    object.getWorldScale(scratchScale);
    bounds.getSize(boundsSize);
    if (colliders === "ball") {
        const ballRadius = radius ?? Math.max(
            boundsSize.x * scratchScale.x,
            boundsSize.y * scratchScale.y,
            boundsSize.z * scratchScale.z,
        ) * 0.5;
        return sphere.create({ radius: Math.max(ballRadius, 0.01) });
    }
    return box.create({
        halfExtents: [
            Math.max(boundsSize.x * scratchScale.x * 0.5, 0.01),
            Math.max(boundsSize.y * scratchScale.y * 0.5, 0.01),
            Math.max(boundsSize.z * scratchScale.z * 0.5, 0.01),
        ],
    });
}

function toMotionType(value: CrashcatPhysicsProperties["type"]): MotionType {
    if (value === "dynamic") return MotionType.DYNAMIC;
    if (value === "kinematic") return MotionType.KINEMATIC;
    return MotionType.STATIC;
}

function toMotionQuality(value?: string): MotionQuality | undefined {
    if (value === "linearCast") return MotionQuality.LINEAR_CAST;
    if (value === "discrete") return MotionQuality.DISCRETE;
    return undefined;
}

function CrashcatPhysicsView({ properties, children }: ComponentViewProps<CrashcatPhysicsProperties>) {
    const { nodeId, getObject } = useNode();
    const crashcat = useCrashcat();

    useEffect(() => {
        if (!crashcat) return;

        const object = getObject();
        if (!object) return;

        object.updateWorldMatrix(true, true);
        const bounds = getLocalBounds(object);
        if (!bounds) return;

        const collider = createShape(object, bounds, properties.colliders ?? "autoBox", properties.radius, properties.capsuleHalfHeight);
        if (!collider) return;

        bounds.getCenter(boundsCenter).applyMatrix4(object.matrixWorld);
        object.getWorldQuaternion(tmpQuat);

        const motionType = toMotionType(properties.type ?? "fixed");
        const body = rigidBody.create(crashcat.world, {
            shape: collider,
            motionType,
            motionQuality: toMotionQuality(properties.motionQuality),
            objectLayer: motionType === MotionType.STATIC ? crashcat.staticObjectLayer : crashcat.movingObjectLayer,
            position: [boundsCenter.x, boundsCenter.y, boundsCenter.z],
            quaternion: [tmpQuat.x, tmpQuat.y, tmpQuat.z, tmpQuat.w],
            sensor: Boolean(properties.sensor),
            collideKinematicVsNonDynamic: motionType === MotionType.KINEMATIC,
            friction: properties.friction,
            restitution: properties.restitution,
            userData: { nodeId },
        });

        if (properties.linearVelocity) rigidBody.setLinearVelocity(crashcat.world, body, properties.linearVelocity);

        crashcat.register(nodeId, body, object, {
            motionType,
            sensor: Boolean(properties.sensor),
            events: {
                collisionEnter: properties.collisionEnter,
                collisionExit: properties.collisionExit,
                sensorEnter: properties.sensorEnter,
                sensorExit: properties.sensorExit,
            },
        });

        return () => {
            crashcat.unregister(nodeId);
        };
    }, [crashcat, getObject, nodeId, properties]);

    return <>{children}</>;
}

const crashcatPhysicsFields: FieldDefinition[] = [
    {
        name: "colliders", type: "select", label: "Collider", options: [
            { value: "autoBox", label: "Auto Box" },
            { value: "ball", label: "Ball" },
            { value: "capsule", label: "Capsule" },
            { value: "trimesh", label: "Tri Mesh" },
            { value: "hull", label: "Hull" },
        ],
    },
    {
        name: "type", type: "select", label: "Motion Type", options: [
            { value: "fixed", label: "Fixed" },
            { value: "dynamic", label: "Dynamic" },
            { value: "kinematic", label: "Kinematic" },
        ],
    },
    { name: "friction", type: "number", label: "Friction", step: 0.05 },
    { name: "restitution", type: "number", label: "Restitution", step: 0.05 },
    { name: "radius", type: "number", label: "Ball/Capsule Radius", step: 0.05 },
];

type CrashcatPhysicsEditorProps = {
    component: { properties: CrashcatPhysicsProperties };
    onUpdate: (values: CrashcatPhysicsProperties) => void;
};

function CrashcatPhysicsEditor({ component, onUpdate }: CrashcatPhysicsEditorProps) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <FieldRenderer fields={crashcatPhysicsFields} values={component.properties} onChange={onUpdate} />
            <BooleanField name="sensor" label="Sensor" values={component.properties} onChange={onUpdate} fallback={false} />
            <FieldRenderer
                fields={[{
                    name: "motionQuality", type: "select", label: "Motion Quality", options: [
                        { value: "discrete", label: "Discrete" },
                        { value: "linearCast", label: "Linear Cast" },
                    ],
                }]}
                values={component.properties}
                onChange={onUpdate}
            />
            <Vector3Field name="linearVelocity" label="Linear Velocity" values={component.properties} onChange={onUpdate} fallback={[0, 0, 0]} />
            <StringField name="sensorEnter" label="Sensor Enter" values={component.properties} onChange={onUpdate} fallback="" />
            <StringField name="sensorExit" label="Sensor Exit" values={component.properties} onChange={onUpdate} fallback="" />
        </div>
    );
}

const CrashcatPhysicsComponent: Component = {
    name: "CrashcatPhysics",
    Editor: CrashcatPhysicsEditor,
    View: CrashcatPhysicsView,
    defaultProperties: {},
};

export default CrashcatPhysicsComponent;
